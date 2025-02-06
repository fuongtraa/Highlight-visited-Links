const MAX_HISTORY_ITEMS = 3000000; // Giới hạn số lượng mục
const MAX_STORAGE_MB = 5; // Giới hạn lưu trữ 5MB
const SIX_MONTHS_AGO = Date.now() - 1000 * 60 * 60 * 24 * 30 * 6; // 6 tháng trước

// Khởi tạo dữ liệu chỉ chạy 1 lần khi cài đặt hoặc cập nhật
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.storage.local.get('initialized', (result) => {
      if (!result.initialized) {
        initializeHistory().then(() => {
          chrome.storage.local.set({ initialized: true });
        }).catch(error => {
          console.log("Error in initializeHistory:", error);
        });
      }
    });
  } catch (error) {
    console.log("Error in onInstalled listener:", error);
  }
});

// Lắng nghe tin nhắn từ popup hoặc content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.action === "updateSettings") {
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { action: "updateHighlight" });
        });
      });
    }
  } catch (error) {
    console.log("Error in onMessage listener:", error);
  }
});

// CircularBuffer để quản lý dung lượng dữ liệu
class CircularBuffer {
  constructor(size, initialData = []) {
    try {
      this.size = size;
      this.buffer = [];
      initialData.forEach(item => this.push(item));
    } catch (error) {
      console.log("Error in CircularBuffer constructor:", error);
    }
  }

  push(item) {
    try {
      if (this.buffer.length >= this.size) {
        this.buffer.shift(); // Xóa mục cũ nhất
      }
      this.buffer.push(item);
    } catch (error) {
      console.log("Error in CircularBuffer.push:", error);
    }
  }

  toArray() {
    try {
      return this.buffer;
    } catch (error) {
      console.log("Error in CircularBuffer.toArray:", error);
      return [];
    }
  }
}

// Tải lịch sử duyệt web lần đầu
async function initializeHistory() {
  try {
    console.time("initializeHistory"); // Bắt đầu đo thời gian
    let historyItems = [];
    let lastEndTime = Date.now();
    let results;
    const QUERY_INTERVAL = 1000 * 60 * 60 * 24 * 7; // 1 tuần
    do {
      const startTime = performance.now(); // Bắt đầu đo thời gian cho mỗi lần gọi API
      results = await chrome.history.search({
        text: "",
        maxResults: 1000,
        startTime: lastEndTime - QUERY_INTERVAL,
        endTime: lastEndTime
      });
      const endTime = performance.now(); // Kết thúc đo thời gian cho mỗi lần gọi API
      console.log(`Thời gian cho mỗi lần gọi API: ${(endTime - startTime) / 1000} giây`);
      console.log(`Số lượng liên kết trích xuất được trong lần gọi API này: ${results.length}`);

      if (results.length > 0) {
        lastEndTime = results[results.length - 1].lastVisitTime - 1;
        historyItems = historyItems.concat(results);
      }
    } while (results.length > 0 && historyItems.length < MAX_HISTORY_ITEMS);

    console.log(`Tổng số lượng liên kết trích xuất được: ${historyItems.length}`);
    await saveHistory(historyItems);
    console.timeEnd("initializeHistory"); // Kết thúc đo thời gian và in ra console
  } catch (error) {
    console.log("Error in initializeHistory:", error);
  }
}

// Xử lý lưu trữ, xóa dữ liệu cũ nếu quá tải
async function saveHistory(historyItems) {
  try {
    let parsedData = parseHistory(historyItems);

    let result = await chrome.storage.local.get("urlData");
    let storedData = result.urlData || [];
    console.log(`Số lượng liên kết trước khi lọc: ${storedData.length}`);

    // Xóa dữ liệu cũ hơn 6 tháng
    storedData = storedData.filter(item => item.lastVisitTime > SIX_MONTHS_AGO);
    console.log(`Số lượng liên kết sau khi lọc dữ liệu cũ hơn 6 tháng: ${storedData.length}`);

    // Tránh trùng lặp bằng Map
    let urlMap = new Map(storedData.map(item => [`${item.domain}:${item.path}?${item.query}`, item]));

    // Thêm mới các mục chưa tồn tại trong Map
    parsedData.forEach(item => {
      urlMap.set(`${item.domain}:${item.path}?${item.query}`, item);
    });

    let mergedData = Array.from(urlMap.values());
    console.log(`Số lượng liên kết sau khi tránh trùng lặp: ${mergedData.length}`);

    // Kiểm tra kích thước JSON, nếu vượt quá thì xóa dữ liệu cũ
    while (new Blob([JSON.stringify(mergedData)]).size / (1024 * 1024) > MAX_STORAGE_MB) {
      mergedData.shift(); // Xóa mục cũ nhất
    }
    await chrome.storage.local.set({ urlData: mergedData });
    console.log(`Số lượng liên kết đã lưu vào storage: ${mergedData.length}`);
    console.log(`Dung lượng đã sử dụng: ${(new Blob([JSON.stringify(mergedData)]).size / (1024 * 1024)).toFixed(2)} MB`);
  } catch (error) {
    console.log("Error in saveHistory:", error);
  }
}

// Lắng nghe trang mới truy cập
chrome.history.onVisited.addListener((historyItem) => {
  try {
    let parsed = parseUrl(historyItem.url, historyItem.lastVisitTime);
    if (!parsed) return;

    chrome.storage.local.get("urlData", (result) => {
      try {
        let urlData = result.urlData || [];

        // Tránh trùng lặp bằng Map
        let urlMap = new Map(urlData.map(item => [`${item.domain}:${item.path}?${item.query}`, item]));

        // Thêm mới các mục chưa tồn tại trong Map
        urlMap.set(`${parsed.domain}:${parsed.path}?${parsed.query}`, parsed);

        // Xóa dữ liệu cũ nếu quá giới hạn
        while (urlMap.size > MAX_HISTORY_ITEMS) {
          urlMap.delete([...urlMap.keys()][0]); // Xóa mục cũ nhất
        }

        chrome.storage.local.set({ urlData: Array.from(urlMap.values()) }, () => {
          // Gửi tín hiệu cập nhật highlight ngay lập tức
          sendMessageToContentScript();
        });
      } catch (error) {
        console.log("Error in onVisited listener (inner):", error);
      }
    });
  } catch (error) {
    console.log("Error in onVisited listener (outer):", error);
  }
});

// Hàm parseHistory
function parseHistory(historyItems) {
  try {
    return historyItems.map(item => parseUrl(item.url, item.lastVisitTime)).filter(Boolean);
  } catch (error) {
    console.log("Error in parseHistory:", error);
    return [];
  }
}

// Parse URL
function parseUrl(url, lastVisitTime) {
  try {
    let { hostname, pathname, searchParams } = new URL(url);
    let domainParts = hostname.split('.');
    let domain = domainParts.length > 1 ? domainParts.slice(-2, -1)[0] : hostname;
    return { domain, path: pathname, query: searchParams.toString(), lastVisitTime, url };
  } catch (error) {
    console.log("Error in parseUrl:", error, url);
    return null;
  }
}

// Hàm gửi tin nhắn tới content script của tab đang mở
function sendMessageToContentScript() {
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        let tabUrl = tabs[0].url;

        // Kiểm tra nếu URL không phải là chrome://, file:// hoặc các URL đặc biệt khác
        if (tabUrl && !tabUrl.startsWith("chrome://") && !tabUrl.startsWith("file://")) {
          chrome.scripting.executeScript(
            {
              target: { tabId: tabs[0].id },
              files: ['content.js']
            },
            () => {
              if (chrome.runtime.lastError) {
                console.warn("Content script chưa được tải hoặc tab không hợp lệ:", chrome.runtime.lastError);
              } else {
                chrome.tabs.sendMessage(tabs[0].id, { action: "updateHighlight" }, (response) => {
                  if (chrome.runtime.lastError) {
                    console.warn("Content script chưa được tải hoặc tab không hợp lệ:", chrome.runtime.lastError);
                  }
                });
              }
            }
          );
        }
      }
    });
  } catch (error) {
    console.log("Error in sendMessageToContentScript:", error);
  }
}