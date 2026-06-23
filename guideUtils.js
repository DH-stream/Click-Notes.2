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
      if (!["http:", "https:", "file:"].includes(url.protocol)) return "";
      if (url.protocol === "file:") return `file://${url.pathname}`;
      return `${url.origin}${url.pathname}`;
    } catch {
      return "";
    }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function createGuide(title, startUrl) {
    const timestamp = nowIso();
    return {
      id: makeId("guide"),
      schemaVersion: 1,
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
        showInstructionText: true,
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
    const target = step?.target || {};
    const showInstructionText =
      step?.playback?.showInstructionText ?? step?.playback?.showPopup;
    return {
      id: step?.id || makeId("step"),
      order: index + 1,
      title: String(step?.title || "").trim(),
      body: String(step?.body || "").trim(),
      pageUrl: normalizeGuideUrl(step?.pageUrl || target.pageUrl || ""),
      target: {
        selector: target.selector || "",
        selectorConfidence: target.selectorConfidence || "weak",
        fallbackPath: target.fallbackPath || "",
        fallbackText: String(target.fallbackText || ""),
        fallbackAriaLabel: String(target.fallbackAriaLabel || ""),
        fallbackRole: String(target.fallbackRole || ""),
        fallbackTagName: String(target.fallbackTagName || ""),
        id: String(target.id || ""),
        classList: Array.isArray(target.classList) ? target.classList : [],
        placeholder: String(target.placeholder || ""),
        name: String(target.name || ""),
        type: String(target.type || ""),
        href: normalizeGuideUrl(target.href || ""),
        pageUrl: normalizeGuideUrl(target.pageUrl || step?.pageUrl || ""),
        anchorMode: target.anchorMode === "rect" ? "rect" : "element",
        rect: normalizeRect(target.rect),
        anchorPoint: normalizeAnchorPoint(target.anchorPoint, target.rect),
      },
      playback: {
        showInstructionText: showInstructionText !== false,
        showPopup: showInstructionText !== false,
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

  function normalizeRect(rect = {}) {
    return {
      x: numberOrZero(rect.x),
      y: numberOrZero(rect.y),
      width: numberOrZero(rect.width),
      height: numberOrZero(rect.height),
      documentX: numberOrZero(rect.documentX),
      documentY: numberOrZero(rect.documentY),
    };
  }

  function normalizeAnchorPoint(anchorPoint = {}, rect = {}) {
    const hasAnchor =
      typeof anchorPoint.viewportX === "number" ||
      typeof anchorPoint.viewportY === "number" ||
      typeof anchorPoint.documentX === "number" ||
      typeof anchorPoint.documentY === "number";
    if (hasAnchor) {
      return {
        viewportX: numberOrZero(anchorPoint.viewportX),
        viewportY: numberOrZero(anchorPoint.viewportY),
        documentX: numberOrZero(anchorPoint.documentX),
        documentY: numberOrZero(anchorPoint.documentY),
      };
    }
    return {
      viewportX: numberOrZero(rect.x) + Math.round(numberOrZero(rect.width) / 2),
      viewportY: numberOrZero(rect.y) + Math.round(numberOrZero(rect.height) / 2),
      documentX: numberOrZero(rect.documentX) + Math.round(numberOrZero(rect.width) / 2),
      documentY: numberOrZero(rect.documentY) + Math.round(numberOrZero(rect.height) / 2),
    };
  }

  function numberOrZero(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function stepHasTargetOrAnchor(step) {
    const target = step?.target || {};
    const rect = target.rect || {};
    const anchor = target.anchorPoint || {};
    return Boolean(
      target.selector ||
        target.fallbackPath ||
        target.fallbackText ||
        (Number(rect.width) > 0 && Number(rect.height) > 0) ||
        (Number.isFinite(Number(anchor.documentX)) && Number.isFinite(Number(anchor.documentY))),
    );
  }

  function prepareImportedGuide(input, existingIds = []) {
    let guide = input;
    try {
      if (typeof input === "string") guide = JSON.parse(input);
    } catch {
      throw new Error("Import failed: file is not valid JSON");
    }
    if (
      !guide ||
      typeof guide !== "object" ||
      !Array.isArray(guide.steps)
    ) {
      throw new Error("Import failed: guide must include a steps array");
    }
    if (!String(guide.title || "").trim()) {
      throw new Error("Import failed: guide title is required");
    }
    if (!String(guide.startUrl || "").trim()) {
      throw new Error("Import failed: guide startUrl is required");
    }
    guide.steps.forEach((step, index) => {
      if (!String(step?.title || step?.body || "").trim()) {
        throw new Error(`Import failed: step ${index + 1} needs title or body`);
      }
      if (!stepHasTargetOrAnchor(step)) {
        throw new Error(`Import failed: step ${index + 1} needs a target or saved position`);
      }
    });
    if (!guide.steps.length) {
      throw new Error("Import failed: guide needs at least one step");
    }
    const timestamp = nowIso();
    const id = existingIds.includes(guide.id) ? makeId("guide") : guide.id || makeId("guide");
    const seenStepIds = new Set();
    return {
      id,
      schemaVersion: Number(guide.schemaVersion) || 1,
      title: String(guide.title).trim(),
      description: String(guide.description || ""),
      startUrl: normalizeGuideUrl(guide.startUrl),
      createdAt: guide.createdAt || timestamp,
      updatedAt: timestamp,
      version: Number(guide.version) || 1,
      steps: guide.steps.map((step, index) => {
        const normalized = normalizeStep(step, index);
        if (!normalized.id || seenStepIds.has(normalized.id)) normalized.id = makeId("step");
        seenStepIds.add(normalized.id);
        return normalized;
      }),
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
