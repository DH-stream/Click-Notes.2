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

  function deriveSafeUrlMatch(value, baseUrl = "") {
    const raw = textSnippet(value, 500);
    if (!raw || /^\/\//.test(raw)) return "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
      try {
        const url = new URL(raw);
        if (!["http:", "https:", "file:"].includes(url.protocol)) return "";
        if (url.protocol === "file:") return `file://${url.pathname}`.slice(0, 500);
        return (url.pathname || "/").slice(0, 500);
      } catch {
        return "";
      }
    }
    if (baseUrl) {
      try {
        const url = new URL(raw, baseUrl);
        if (!["http:", "https:", "file:"].includes(url.protocol)) return "";
        if (url.protocol === "file:") return `file://${url.pathname}`.slice(0, 500);
        return (url.pathname || "/").slice(0, 500);
      } catch {}
    }
    const withoutSensitiveParts = raw.split(/[?#]/, 1)[0];
    if (!withoutSensitiveParts || !/^[a-zA-Z0-9._~!$&'()*+,;=:@%/-]+$/.test(withoutSensitiveParts)) {
      return "";
    }
    return withoutSensitiveParts.slice(0, 500);
  }

  function matchesAdvanceUrl(currentUrl, advanceValue) {
    const currentFull = normalizeGuideUrl(currentUrl);
    if (!currentFull) return false;
    const rawAdvance = textSnippet(advanceValue, 500);
    const safeAdvance = deriveSafeUrlMatch(rawAdvance);
    if (!safeAdvance) return false;
    try {
      if (/^(https?|file):/i.test(rawAdvance) && normalizeGuideUrl(rawAdvance) === currentFull) {
        return true;
      }
      const current = new URL(currentFull);
      if (safeAdvance.startsWith("file://")) return currentFull === safeAdvance;
      if (safeAdvance.startsWith("/")) return current.pathname === safeAdvance;
      return current.pathname.includes(safeAdvance) || currentFull.includes(safeAdvance);
    } catch {
      return false;
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

  function getTargetDisplayLabel(target = {}) {
    const tagName = String(target.fallbackTagName || "").toLowerCase();
    const role = String(target.fallbackRole || "").toLowerCase();
    const type = String(target.type || "").toLowerCase();
    if (target.anchorMode === "rect") {
      return ["body", "html"].includes(tagName) ? "Page area" : "Visual area";
    }
    if (type === "checkbox") return "Checkbox";
    if (tagName === "button" || role === "button") return "Button";
    if (tagName === "a" || role === "link" || target.href) return "Link";
    if (tagName === "textarea") return "Text area";
    if (tagName === "select") return "Dropdown";
    if (tagName === "input") return "Input field";
    if (["body", "html"].includes(tagName)) return "Page area";
    return "Step target";
  }

  function normalizeGuide(guide) {
    const timestamp = nowIso();
    return {
      id: normalizeEntityId(guide?.id, "guide"),
      schemaVersion: Number(guide?.schemaVersion) || 1,
      title: textSnippet(guide?.title || "Untitled guide", 140) || "Untitled guide",
      description: textSnippet(guide?.description, 500),
      startUrl: normalizeGuideUrl(guide?.startUrl || ""),
      createdAt: guide?.createdAt || timestamp,
      updatedAt: guide?.updatedAt || timestamp,
      version: Number(guide?.version) || 1,
      steps: normalizeSteps(guide?.steps),
    };
  }

  function normalizeStep(step, index) {
    const target = step?.target || {};
    const showInstructionText =
      step?.playback?.showInstructionText ?? step?.playback?.showPopup;
    const fallbackTagName = String(target.fallbackTagName || "").trim().toLowerCase();
    const advanceMode = normalizeAdvanceMode(step?.advance?.mode);
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
        mode: advanceMode,
        value:
          advanceMode === "urlMatch"
            ? deriveSafeUrlMatch(step?.advance?.value)
            : textSnippet(step?.advance?.value, 500),
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

  function normalizeSteps(steps) {
    if (!Array.isArray(steps)) return [];
    const seenStepIds = new Set();
    return steps.map((step, index) => {
      const normalized = normalizeStep(step, index);
      if (!normalized.id || seenStepIds.has(normalized.id)) normalized.id = makeId("step");
      seenStepIds.add(normalized.id);
      return normalized;
    });
  }

  function upsertGuideStep(guide, target, stepId = "", fields = {}) {
    const normalizedGuide = normalizeGuide(guide);
    const existingIndex = stepId
      ? normalizedGuide.steps.findIndex((step) => step.id === stepId)
      : -1;
    const existing = existingIndex >= 0 ? normalizedGuide.steps[existingIndex] : createStep(target);
    const nextTarget = target || existing.target;
    const safeLinkMatch = deriveSafeUrlMatch(
      nextTarget?.href,
      nextTarget?.pageUrl || normalizedGuide.startUrl,
    );
    const shouldAutoMatchLink =
      fields.advanceMode === undefined &&
      existing.advance?.mode === "manual" &&
      Boolean(safeLinkMatch);
    const advanceMode = shouldAutoMatchLink
      ? "urlMatch"
      : fields.advanceMode !== undefined
        ? fields.advanceMode
        : existing.advance?.mode;
    const advanceValue =
      fields.advanceValue !== undefined
        ? fields.advanceValue
        : shouldAutoMatchLink || (advanceMode === "urlMatch" && !existing.advance?.value)
          ? safeLinkMatch
          : existing.advance?.value;
    const showInstructionText = booleanField(
      fields.showInstructionText,
      existing.playback?.showInstructionText ?? existing.playback?.showPopup,
      true,
    );
    const rawStep = {
      ...existing,
      title: stringField(fields.title, existing.title) || "Untitled step",
      body: stringField(fields.body, existing.body),
      pageUrl: nextTarget?.pageUrl || existing.pageUrl || "",
      target: nextTarget,
      playback: {
        showInstructionText,
        showPopup: showInstructionText,
        highlightTarget: booleanField(
          fields.highlightTarget,
          existing.playback?.highlightTarget,
          true,
        ),
        dimPage: booleanField(fields.dimPage, existing.playback?.dimPage, true),
        autoScroll: booleanField(fields.autoScroll, existing.playback?.autoScroll, true),
        popupPlacement:
          fields.popupPlacement !== undefined
            ? fields.popupPlacement
            : existing.playback?.popupPlacement,
      },
      advance: {
        mode: advanceMode,
        value: advanceValue,
        allowManualFallback: true,
      },
    };
    const step = normalizeStep(
      rawStep,
      existingIndex >= 0 ? existingIndex : normalizedGuide.steps.length,
    );
    if (existingIndex >= 0) normalizedGuide.steps[existingIndex] = step;
    else normalizedGuide.steps.push(step);
    normalizedGuide.updatedAt = nowIso();
    normalizedGuide.steps = normalizeSteps(normalizedGuide.steps);
    return normalizedGuide;
  }

  function createBuilderResumeSession(guideId, fields = {}) {
    const mode = normalizeAdvanceMode(fields.advanceMode);
    const waitForUrl = deriveSafeUrlMatch(fields.advanceValue);
    const normalizedGuideId = String(guideId || "").trim();
    if (mode !== "urlMatch" || !waitForUrl || !/^[a-zA-Z0-9_-]{1,120}$/.test(normalizedGuideId)) {
      return null;
    }
    const session = {
      guideId: normalizedGuideId,
      waitForUrl,
      createdAt: nowIso(),
    };
    if (Number.isInteger(fields.tabId)) session.tabId = fields.tabId;
    return session;
  }

  function shouldResumeBuilderSession(session, currentUrl) {
    if (!session?.guideId || !session?.waitForUrl) return false;
    return matchesAdvanceUrl(currentUrl, session.waitForUrl);
  }

  function stringField(value, fallback = "") {
    if (value === undefined || value === null) return textSnippet(fallback, 2000);
    return String(value).replace(/\s+/g, " ").trim();
  }

  function booleanField(value, fallback, defaultValue) {
    if (value === undefined || value === null) {
      if (fallback === undefined || fallback === null) return defaultValue;
      return fallback !== false;
    }
    return value !== false;
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
      throw new Error("This guide file could not be read.");
    }
    if (
      !guide ||
      typeof guide !== "object" ||
      !Array.isArray(guide.steps)
    ) {
      throw new Error("This guide file is missing steps.");
    }
    if (!String(guide.title || "").trim()) {
      throw new Error("This guide file is missing a title.");
    }
    if (!String(guide.startUrl || "").trim()) {
      throw new Error("This guide file is missing a start page.");
    }
    const startUrl = normalizeGuideUrl(guide.startUrl);
    if (!startUrl) {
      throw new Error("This guide file has an unsafe start page.");
    }
    guide.steps.forEach((step, index) => {
      if (!String(step?.title || step?.body || "").trim()) {
        throw new Error("One step is missing its instructions.");
      }
      if (!stepHasTargetOrAnchor(step)) {
        throw new Error("One step is missing a saved target.");
      }
    });
    if (!guide.steps.length) {
      throw new Error("This guide file is missing steps.");
    }
    const timestamp = nowIso();
    const guideId = normalizeEntityId(guide.id, "guide");
    const id = existingIds.includes(guideId) ? makeId("guide") : guideId;
    const normalizedGuide = normalizeGuide({ ...guide, id, startUrl, updatedAt: timestamp });
    return normalizedGuide;
  }

  return {
    createGuide,
    createBuilderResumeSession,
    createStep,
    deriveSafeUrlMatch,
    getTargetDisplayLabel,
    makeId,
    matchesAdvanceUrl,
    normalizeGuide,
    normalizeGuideUrl,
    normalizeStep,
    prepareImportedGuide,
    shouldResumeBuilderSession,
    upsertGuideStep,
  };
});
