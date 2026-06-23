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
    const fallbackTagName = String(target.fallbackTagName || "").trim().toLowerCase();
    return {
      id: normalizeEntityId(step?.id, "step"),
      order: index + 1,
      title: textSnippet(step?.title, 140),
      body: textSnippet(step?.body, 2000),
      pageUrl: normalizeGuideUrl(step?.pageUrl || target.pageUrl || ""),
      target: {
        selector: textSnippet(target.selector, 500),
        selectorConfidence: target.selectorConfidence || "weak",
        fallbackPath: textSnippet(target.fallbackPath, 500),
        fallbackText: textSnippet(target.fallbackText, 160),
        fallbackAriaLabel: textSnippet(target.fallbackAriaLabel, 160),
        fallbackRole: textSnippet(target.fallbackRole, 80),
        fallbackTagName: /^[a-z][a-z0-9-]*$/.test(fallbackTagName) ? fallbackTagName : "",
        id: textSnippet(target.id, 160),
        classList: normalizeClassList(target.classList),
        placeholder: textSnippet(target.placeholder, 160),
        name: textSnippet(target.name, 120),
        type: textSnippet(target.type, 80),
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
        popupPlacement: normalizePlacement(step?.playback?.popupPlacement),
      },
      advance: {
        mode: normalizeAdvanceMode(step?.advance?.mode),
        value: textSnippet(step?.advance?.value, 500),
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

  function textSnippet(value, max) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function normalizeClassList(classList) {
    if (!Array.isArray(classList)) return [];
    return classList
      .map((item) => String(item || "").trim())
      .filter((item) => /^[a-zA-Z0-9_-]{1,80}$/.test(item))
      .slice(0, 12);
  }

  function normalizePlacement(value) {
    const placement = String(value || "auto");
    return ["auto", "top", "right", "bottom", "left"].includes(placement) ? placement : "auto";
  }

  function normalizeAdvanceMode(value) {
    const mode = String(value || "manual");
    return ["manual", "urlMatch", "elementVisible"].includes(mode) ? mode : "manual";
  }

  function normalizeEntityId(value, prefix) {
    const id = String(value || "").trim();
    if (/^[a-zA-Z0-9_-]{1,120}$/.test(id)) return id;
    return makeId(prefix);
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
    const startUrl = normalizeGuideUrl(guide.startUrl);
    if (!startUrl) {
      throw new Error("Import failed: guide startUrl must be a safe absolute URL");
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
    const guideId = normalizeEntityId(guide.id, "guide");
    const id = existingIds.includes(guideId) ? makeId("guide") : guideId;
    const seenStepIds = new Set();
    return {
      id,
      schemaVersion: Number(guide.schemaVersion) || 1,
      title: textSnippet(guide.title, 140),
      description: textSnippet(guide.description, 500),
      startUrl,
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
