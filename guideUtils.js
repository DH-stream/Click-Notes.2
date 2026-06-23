(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ClickGuideUtils = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function makeId(prefix = "id") {
    const random =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix}-${random}`;
  }

  function normalizeGuideUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    } catch {
      return String(value).split("#")[0].split("?")[0];
    }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function createGuide(title, startUrl) {
    const timestamp = nowIso();
    return {
      id: makeId("guide"),
      title: String(title || "Untitled guide").trim() || "Untitled guide",
      description: "",
      startUrl: normalizeGuideUrl(startUrl),
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      steps: [],
    };
  }

  function createStep(target) {
    return {
      id: makeId("step"),
      order: 0,
      title: "",
      body: "",
      pageUrl: target?.pageUrl || "",
      target: target || {
        selector: "",
        fallbackPath: "",
      },
      playback: {
        showPopup: true,
        highlightTarget: true,
        dimPage: true,
        autoScroll: true,
        popupPlacement: "auto",
      },
      advance: {
        mode: "manual",
        value: "",
        allowManualFallback: true,
      },
    };
  }

  function normalizeStep(step, index) {
    return {
      ...createStep(step?.target),
      ...step,
      id: step?.id || makeId("step"),
      order: index + 1,
      title: String(step?.title || "").trim(),
      body: String(step?.body || "").trim(),
      target: {
        ...(step?.target || {}),
        selector: step?.target?.selector || "",
        fallbackPath: step?.target?.fallbackPath || "",
      },
      playback: {
        showPopup: step?.playback?.showPopup !== false,
        highlightTarget: step?.playback?.highlightTarget !== false,
        dimPage: step?.playback?.dimPage !== false,
        autoScroll: step?.playback?.autoScroll !== false,
        popupPlacement: step?.playback?.popupPlacement || "auto",
      },
      advance: {
        mode: step?.advance?.mode || "manual",
        value: step?.advance?.value || "",
        allowManualFallback: step?.advance?.allowManualFallback !== false,
      },
    };
  }

  function prepareImportedGuide(input, existingIds = []) {
    let guide = input;
    if (typeof input === "string") guide = JSON.parse(input);
    if (
      !guide ||
      typeof guide !== "object" ||
      !String(guide.title || "").trim() ||
      !String(guide.startUrl || "").trim() ||
      !Array.isArray(guide.steps)
    ) {
      throw new Error("Invalid guide JSON");
    }
    const timestamp = nowIso();
    const id = existingIds.includes(guide.id) ? makeId("guide") : guide.id || makeId("guide");
    return {
      id,
      title: String(guide.title).trim(),
      description: String(guide.description || ""),
      startUrl: normalizeGuideUrl(guide.startUrl),
      createdAt: guide.createdAt || timestamp,
      updatedAt: timestamp,
      version: Number(guide.version) || 1,
      steps: guide.steps.map(normalizeStep),
    };
  }

  return {
    createGuide,
    createStep,
    makeId,
    normalizeGuideUrl,
    normalizeStep,
    prepareImportedGuide,
  };
});
