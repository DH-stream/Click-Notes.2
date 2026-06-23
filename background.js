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
  const { activePlayback } = await chrome.storage.local.get({ activePlayback: null });
  if (!activePlayback?.guide) return;
  if (activePlayback.tabId !== tabId) return;
  await injectGuide(tabId);
});
