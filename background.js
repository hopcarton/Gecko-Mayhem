chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ extensionEnabled: false });
  updateBadge(false);
});

chrome.runtime.onStartup.addListener(async () => {
  const { extensionEnabled } = await chrome.storage.local.get(['extensionEnabled']);
  updateBadge(extensionEnabled ?? false);
});

chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (!tab.id) return;
    const { extensionEnabled } = await chrome.storage.local.get(['extensionEnabled']);
    const newState = !(extensionEnabled ?? false);
    await chrome.storage.local.set({ extensionEnabled: newState });
    updateBadge(newState);
    newState ? await injectGame(tab.id) : await cleanupGame(tab.id);
  } catch (_) { }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) return;
    const { extensionEnabled } = await chrome.storage.local.get(['extensionEnabled']);
    if (extensionEnabled) await injectGame(tabId);
  }
});

async function injectGame(tabId) {
  try {
    const [{ result: injected } = {}] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => Boolean(window.__hupunaZenBoxInjected)
    });
    if (!injected) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
    }
  } catch (_) { }
}

async function cleanupGame(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (typeof window.__hupunaCleanup === 'function') window.__hupunaCleanup();
      }
    });
  } catch (_) { }
}

function updateBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? 'ON' : '' });
  if (enabled) chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
}
