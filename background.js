// Service worker MV3: chỉ tiêm game khi người dùng bấm icon
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (!tab.id) return;
    // Hỏi trang xem đã được tiêm chưa
    const [{ result: injected } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => Boolean(window.__hupunaZenBoxInjected)
    });

    if (injected) {
      // Đã chạy rồi → gọi hàm cleanup trong trang nếu có
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => { if (typeof window.__hupunaCleanup === 'function') window.__hupunaCleanup(); }
      });
    } else {
      // Chưa chạy → tiêm content.js
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    }
  } catch (e) {
    console.warn('Không thể tiêm/cleanup content.js:', e);
  }
});


