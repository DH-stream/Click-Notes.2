(() => {
  const originalEnsureInjected = window.ensureInjected;
  if (typeof originalEnsureInjected !== "function") return;

  window.ensureInjected = async function ensureInjectedWithHighlightPolish(tabId) {
    await originalEnsureInjected(tabId);
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ["contentHighlightFix.css"] });
    } catch {}
  };
})();
