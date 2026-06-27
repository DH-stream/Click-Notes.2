(() => {
  const originalEnsureInjected = window.ensureInjected;
  if (typeof originalEnsureInjected !== "function") return;

  async function isLoaded(tabId) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: "CLICK_GUIDE_PING" });
      return Boolean(response?.loaded);
    } catch {
      return false;
    }
  }

  window.ensureInjected = async function ensureInjectedWithVisualRectPatch(tabId) {
    if (await isLoaded(tabId)) return;
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["contentStyle.css"] });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["guideUtils.js", "contentRectGeometryPatch.js", "contentScript.js"],
    });
  };
})();
