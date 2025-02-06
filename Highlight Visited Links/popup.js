document.addEventListener("DOMContentLoaded", async () => {
  const toggleHighlight = document.getElementById("toggleHighlight");
  const highlightColor = document.getElementById("highlightColor");
  const toggleOverdrive = document.getElementById("toggleOverdrive");
  const blacklistInput = document.getElementById("blacklist");
  const saveSettings = document.getElementById("saveSettings");
  const reloadData = document.getElementById("reloadData");

  // Load settings from storage
  let settings = await chrome.storage.local.get(["highlightEnabled", "highlightColor", "overdriveEnabled", "blacklist"]);

  toggleHighlight.checked = settings.highlightEnabled ?? true;
  highlightColor.value = settings.highlightColor ?? "#ff0000"; // Mặc định là đỏ
  toggleOverdrive.checked = settings.overdriveEnabled ?? false;
  blacklistInput.value = settings.blacklist?.join(", ") ?? "";

  // Lắng nghe sự thay đổi checkbox và gửi tin nhắn tới content script để gọi lại `highlightLinks`
  toggleHighlight.addEventListener('change', async () => {
    const newSettings = {
      highlightEnabled: toggleHighlight.checked,
      highlightColor: highlightColor.value,
      overdriveEnabled: toggleOverdrive.checked,
      blacklist: blacklistInput.value.split(",").map(domain => domain.trim()),
    };
    await chrome.storage.local.set(newSettings);
    chrome.runtime.sendMessage({ action: "updateSettings" });
    sendMessageToContentScript();  // Gửi tin nhắn tới content script
  });

  toggleOverdrive.addEventListener('change', async () => {
    const newSettings = {
      highlightEnabled: toggleHighlight.checked,
      highlightColor: highlightColor.value,
      overdriveEnabled: toggleOverdrive.checked,
      blacklist: blacklistInput.value.split(",").map(domain => domain.trim()),
    };
    await chrome.storage.local.set(newSettings);
    chrome.runtime.sendMessage({ action: "updateSettings" });
    sendMessageToContentScript();  // Gửi tin nhắn tới content script
  });

  // Lưu các cài đặt
  saveSettings.addEventListener("click", async () => {
    const newSettings = {
      highlightEnabled: toggleHighlight.checked,
      highlightColor: highlightColor.value,
      overdriveEnabled: toggleOverdrive.checked,
      blacklist: blacklistInput.value.split(",").map(domain => domain.trim()),
    };

    await chrome.storage.local.set(newSettings);
    chrome.runtime.sendMessage({ action: "updateSettings" });
    alert("Settings saved!");
    sendMessageToContentScript();  // Gửi tin nhắn tới content script
  });

  // Reload Data
  reloadData.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "reloadHistory" });
  });

  // Lắng nghe tin nhắn về việc tải lại dữ liệu
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "reloadDone") alert("Dữ liệu đã được tải lại!");
  });
});

// Hàm gửi tin nhắn tới content script của tab đang mở
function sendMessageToContentScript() {
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
              console.log("Content script chưa được tải hoặc tab không hợp lệ:", chrome.runtime.lastError);
            } else {
              chrome.tabs.sendMessage(tabs[0].id, { action: "updateHighlight" }, (response) => {
                if (chrome.runtime.lastError) {
                  console.log("Content script chưa được tải hoặc tab không hợp lệ:", chrome.runtime.lastError);
                }
              });
            }
          }
        );
      }
    }
  });
}