async function injectGuide(tabId) {
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["contentStyle.css"] });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["guideUtils.js", "contentScript.js"],
    });
  } catch {}
}

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
