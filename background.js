async function injectGuide(tabId) {
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["contentStyle.css"] });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["guideUtils.js", "contentRectGeometryPatch.js", "contentScript.js"],
    });
  } catch {}
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "CLICK_GUIDE_GET_CURRENT_TAB_ID") return false;
  sendResponse({ tabId: sender.tab?.id });
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { activePlayback } = await chrome.storage.local.get({ activePlayback: null });
  if (activePlayback?.tabId === tabId) await chrome.storage.local.remove("activePlayback");
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  const { activePlayback, activeBuilderSession } = await chrome.storage.local.get({
    activePlayback: null,
    activeBuilderSession: null,
  });
  const shouldInjectPlayback = activePlayback?.guide && activePlayback.tabId === tabId;
  const shouldInjectBuilder =
    activeBuilderSession?.guideId &&
    (!Number.isInteger(activeBuilderSession.tabId) || activeBuilderSession.tabId === tabId);
  if (!shouldInjectPlayback && !shouldInjectBuilder) return;
  await injectGuide(tabId);
});
