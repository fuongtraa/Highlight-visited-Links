// Kiểm tra nếu observer chưa được khai báo
if (typeof observer === 'undefined') {
  let observer;
  let scheduled = false;

  // Lắng nghe thay đổi DOM để tự động cập nhật highlight
  observer = new MutationObserver((mutations) => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(() => {
        try {
          highlightLinks(); // Cập nhật highlight nếu DOM thay đổi
        } catch (error) {
          console.log("Error in highlightLinks during MutationObserver:", error);
        }
        scheduled = false;
      });
    }
  });

  // Cấu hình observer để theo dõi sự thay đổi của các phần tử con trong <body>
  try {
    observer.observe(document.body, { childList: true, subtree: true });
  } catch (error) {
    console.log("Error in observer.observe:", error);
  }
}

// Fix lỗi trên SPA: Lắng nghe sự kiện popstate để highlight lại khi trang thay đổi
window.addEventListener('popstate', () => {
  try {
    highlightLinks();
  } catch (error) {
    console.log("Error in highlightLinks during popstate event:", error);
  }
});

// Hàm highlight các link đã truy cập
async function highlightLinks() {
  try {
    if (!chrome.storage || !chrome.storage.local) {
      console.log("chrome.storage.local is not available.");
      return;
    }

    const { urlData, highlightEnabled, highlightColor, overdriveEnabled, blacklist } = await chrome.storage.local.get([
      "urlData",
      "highlightEnabled",
      "highlightColor",
      "overdriveEnabled",
      "blacklist"
    ]);

    if (!highlightEnabled || !urlData) return;

    let currentDomain = window.location.hostname.split('.').slice(-2, -1)[0];

    // Kiểm tra nếu domain nằm trong blacklist thì không highlight
    if (blacklist && blacklist.includes(currentDomain)) return;

    // Cập nhật biến CSS --highlight-color
    document.documentElement.style.setProperty('--highlight-color', highlightColor);

    const urlMap = new Map(urlData.map(entry => [`${entry.path}?${entry.query}`, entry]));

    document.querySelectorAll("a").forEach(link => {
      let absoluteUrl = link.href.startsWith("/") ? window.location.origin + link.href : link.href;
      let parsed = parseUrl(absoluteUrl);

      // Kiểm tra nếu liên kết đã được đánh dấu là visited bởi trình duyệt
      if (link.matches(':visited')) {
        applyHighlight(link, highlightColor, overdriveEnabled);
      } else if (parsed && parsed.domain === currentDomain && urlMap.has(`${parsed.path}?${parsed.query}`)) {
        applyHighlight(link, highlightColor, overdriveEnabled);
      }
    });
  } catch (error) {
    console.log("Error in highlightLinks:", error);
  }
}

// Kiểm tra trùng khớp URL đã lưu
function isMatch(stored, current) {
  try {
    return stored.path === current.path && stored.query === current.query;
  } catch (error) {
    console.log("Error in isMatch:", error);
    return false;
  }
}

// Áp dụng style cho các link đã truy cập
function applyHighlight(element, color, overdrive) {
  try {
    // Áp dụng CSS cơ bản
    element.style.setProperty('font-weight', 'bold', overdrive ? 'important' : '');
    element.style.setProperty('color', color, overdrive ? 'important' : '');

    // Áp dụng CSS cho các phần tử con
    element.querySelectorAll("*").forEach(child => {
      child.style.setProperty('font-weight', 'bold', overdrive ? 'important' : '');
      child.style.setProperty('color', color, overdrive ? 'important' : '');
    });
  } catch (error) {
    console.log("Error in applyHighlight:", error);
  }
}

// Parse URL và lấy thông tin domain, path, query
function parseUrl(url) {
  try {
    if (!url || typeof url !== "string" || !/^https?:\/\//.test(url)) {
      return null; // Trả về null nếu URL không hợp lệ
    }

    let { hostname, pathname, searchParams } = new URL(url);
    let domainParts = hostname.split(".");
    let domain = domainParts.length > 1 ? domainParts.slice(-2, -1)[0] : hostname;

    return { domain, path: pathname, query: searchParams.toString() };
  } catch (error) {
    console.log("Error in parseUrl:", error, url);
    return null;
  }
}

// Lắng nghe tin nhắn từ background script để update highlight
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.action === "updateHighlight" || message.action === "updateSettings") {
      highlightLinks();
    }
  } catch (error) {
    console.log("Error in onMessage listener:", error);
  }
});

window.addEventListener("load", () => {
  try {
    highlightLinks();
  } catch (error) {
    console.log("Error in highlightLinks during load event:", error);
  }
});

// Đảm bảo gọi highlight khi trang được tải xong
window.addEventListener("DOMContentLoaded", () => {
  try {
    highlightLinks(); // Áp dụng CSS ngay lập tức sau khi trang được tải
  } catch (error) {
    console.log("Error in highlightLinks during DOMContentLoaded event:", error);
  }
});