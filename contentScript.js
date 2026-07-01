(() => {
  if (window.__CLICK_GUIDE_LOADED__) return;
  window.__CLICK_GUIDE_LOADED__ = true;

  const utils = window.ClickGuideUtils || {};
  const normalizeGuideUrl =
    utils.normalizeGuideUrl ||
    ((value) => {
      try {
        const url = new URL(value);
        if (!["http:", "https:", "file:"].includes(url.protocol)) return "";
      if (url.protocol === "file:") return `file://${url.pathname}`;
      return `${url.origin}${url.pathname}`;
    } catch {
      return "";
    }
  });
  const deriveSafeUrlMatch =
    utils.deriveSafeUrlMatch ||
    ((value, baseUrl = "") => {
      const raw = String(value || "").trim().slice(0, 500);
      if (!raw || /^\/\//.test(raw)) return "";
      try {
        const url = new URL(raw, baseUrl || undefined);
        if (!["http:", "https:", "file:"].includes(url.protocol)) return "";
        return url.protocol === "file:" ? `file://${url.pathname}` : url.pathname || "/";
      } catch {
        const path = raw.split(/[?#]/, 1)[0];
        return /^[a-zA-Z0-9._~!$&'()*+,;=:@%/-]+$/.test(path) ? path : "";
      }
    });
  const matchesAdvanceUrl =
    utils.matchesAdvanceUrl ||
    ((currentUrl, advanceValue) => {
      const currentFull = normalizeGuideUrl(currentUrl);
      const safeAdvance = deriveSafeUrlMatch(advanceValue);
      if (!currentFull || !safeAdvance) return false;
      try {
        const current = new URL(currentFull);
        if (safeAdvance.startsWith("file://")) return currentFull === safeAdvance;
        if (safeAdvance.startsWith("/")) return current.pathname === safeAdvance;
        return current.pathname.includes(safeAdvance) || currentFull.includes(safeAdvance);
      } catch {
        return false;
      }
    });
  const getPlaybackResumeStepIndex =
    utils.getPlaybackResumeStepIndex || ((guide, stepIndex) => stepIndex || 0);
  const upsertGuideStep = utils.upsertGuideStep;
  const getTargetDisplayLabel = utils.getTargetDisplayLabel || (() => "Step target");
  const createBuilderResumeSession = utils.createBuilderResumeSession;
  const createPendingNavigationConfirmation = utils.createPendingNavigationConfirmation;
  const shouldShowNavigationConfirmation = utils.shouldShowNavigationConfirmation;
  const shouldResumeBuilderSession = utils.shouldResumeBuilderSession;

  let mode = "idle";
  let hoveredElement = null;
  let overlayLayer = null;
  let inlineEditor = null;
  let activePlayback = null;
  let repositionRaf = null;
  let builderPinsRaf = null;
  let lastBuilderPinsUrl = "";
  let urlWatchTimer = null;
  let builderUrlWatchTimer = null;
  let overlayPositionListenersActive = false;
  let selectionToastTimer = null;
  let celebrationTimer = null;
  let playbackRenderVersion = 0;
  let isPlaybackPreparing = false;

  function safeStorage(fn) {
    try {
      if (!chrome?.runtime?.id) return;
      return fn();
    } catch (e) {
      if (e?.message?.includes("Extension context invalidated")) return;
      throw e;
    }
  }

  async function getLocalStorage(defaults) {
    if (!chrome?.runtime?.id) return defaults;
    return chrome.storage.local.get(defaults);
  }

  async function setLocalStorage(values) {
    if (!chrome?.runtime?.id) return;
    await chrome.storage.local.set(values);
  }

  async function removeLocalStorage(keys) {
    if (!chrome?.runtime?.id) return;
    await chrome.storage.local.remove(keys);
  }

  function clearBuilderUrlWatch() {
    if (builderUrlWatchTimer) clearInterval(builderUrlWatchTimer);
    builderUrlWatchTimer = null;
  }

  async function getCurrentTabId() {
    if (!chrome?.runtime?.id || typeof chrome.runtime.sendMessage !== "function") return null;
    try {
      const response = await chrome.runtime.sendMessage({ type: "CLICK_GUIDE_GET_CURRENT_TAB_ID" });
      return Number.isInteger(response?.tabId) ? response.tabId : null;
    } catch {
      return null;
    }
  }

  function clearAdvanceWatcher() {
    if (urlWatchTimer) clearInterval(urlWatchTimer);
    urlWatchTimer = null;
  }

  function prefersReducedMotion() {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }

  function wait(delay) {
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  function persistActivePlayback() {
    if (!activePlayback) return Promise.resolve();
    const snapshot = {
      guide: activePlayback.guide,
      stepIndex: activePlayback.stepIndex,
      tabId: activePlayback.tabId,
    };
    return safeStorage(() => chrome.storage.local.set({ activePlayback: snapshot }));
  }

  function clearPersistedPlayback() {
    safeStorage(() => chrome.storage.local.remove("activePlayback"));
  }

  function watchBuilderResumeSession() {
    if (builderUrlWatchTimer) return;
    builderUrlWatchTimer = setInterval(() => {
      const currentUrl = normalizeGuideUrl(window.location.href);
      if (currentUrl !== lastBuilderPinsUrl) {
        lastBuilderPinsUrl = currentUrl;
        scheduleBuilderPins();
      }
      resumeBuilderSessionIfReady();
    }, 600);
  }

  function escapeCssValue(value) {
    if (!value) return "";
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function")
      return CSS.escape(value);
    return value.replace(/(["\\#.:\[\]\s>+~])/g, "\\$1");
  }

  function isLikelyGeneratedClassName(className) {
    return (
      /^click-guide-/.test(className) ||
      /^click-notes-/.test(className) ||
      /^css-/.test(className) ||
      /^r-/.test(className) ||
      /^sc-/.test(className) ||
      /^jsx-/.test(className)
    );
  }

  function getStableClass(element) {
    const utilityPrefix =
      /^(mt|mb|ml|mr|mx|my|pt|pb|pl|pr|px|py|text|font|flex|grid|gap|bg|border|rounded|shadow|w-|h-|p-|m-|items|justify|tracking|leading|overflow|z-|top|left|right|bottom|sr-|col-|row-)/;
    return (
      Array.from(element.classList || []).find(
        (cls) =>
          cls.length >= 3 &&
          /^[a-zA-Z0-9_-]+$/.test(cls) &&
          !/^\d/.test(cls) &&
          !utilityPrefix.test(cls) &&
          !isLikelyGeneratedClassName(cls),
      ) || ""
    );
  }

  function getTextSnippet(value, max = 160) {
    return (value || "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function getFallbackText(element) {
    if (isUserEditableElement(element)) return "";
    return getTextSnippet(element.innerText || element.textContent || "");
  }

  function isUserEditableElement(element) {
    const tagName = element.tagName?.toLowerCase();
    return tagName === "input" || tagName === "textarea" || element.isContentEditable;
  }

  function safeToken(value, max = 120) {
    return getTextSnippet(value, max);
  }

  function safeClassList(element) {
    return Array.from(element.classList || [])
      .map((cls) => safeToken(cls, 80))
      .filter((cls) => /^[a-zA-Z0-9_-]+$/.test(cls) && !isLikelyGeneratedClassName(cls))
      .slice(0, 12);
  }

  function buildFallbackPath(element) {
    const segments = [];
    let current = element;
    let depth = 0;
    while (current && current.nodeType === Node.ELEMENT_NODE && depth < 5) {
      const tag = current.tagName.toLowerCase();
      if (current.id) {
        segments.unshift(`${tag}#${escapeCssValue(current.id)}`);
        break;
      }
      const parent = current.parentElement;
      if (!parent) {
        segments.unshift(tag);
        break;
      }
      const sameTag = Array.from(parent.children).filter(
        (node) => node.tagName === current.tagName,
      );
      const index = Math.max(1, sameTag.indexOf(current) + 1);
      segments.unshift(`${tag}:nth-of-type(${index})`);
      current = parent;
      depth += 1;
    }
    return segments.join(" > ");
  }

  function textSelectorFor(element) {
    const role = element.getAttribute("role");
    const text = getTextSnippet(element.innerText || element.textContent || "", 64);
    if (!role || !text) return "";
    const roleMatches = Array.from(document.querySelectorAll(`[role="${escapeCssValue(role)}"]`));
    if (roleMatches.length === 1) return `[role="${escapeCssValue(role)}"]`;
    return "";
  }

  function getElementSelector(element) {
    const dataPriority = [
      ["guideId", "data-guide-id"],
      ["note", "data-note"],
      ["component", "data-component"],
      ["testid", "data-testid"],
      ["cy", "data-cy"],
    ];
    for (const [datasetKey, attrName] of dataPriority) {
      const value = element.dataset?.[datasetKey];
      if (value) return `[${attrName}="${escapeCssValue(value)}"]`;
    }
    if (element.id && !/^\d/.test(element.id) && !isLikelyGeneratedClassName(element.id))
      return `#${escapeCssValue(element.id)}`;
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) return `[aria-label="${escapeCssValue(ariaLabel)}"]`;
    const roleTextSelector = textSelectorFor(element);
    if (roleTextSelector) return roleTextSelector;
    const stableClass = getStableClass(element);
    if (stableClass)
      return `${element.tagName.toLowerCase()}.${escapeCssValue(stableClass)}`;
    return buildFallbackPath(element) || element.tagName.toLowerCase();
  }

  function getSelectorConfidence(element, selector) {
    if (
      element.dataset?.guideId ||
      element.dataset?.note ||
      element.dataset?.component ||
      element.dataset?.testid ||
      element.dataset?.cy
    )
      return "strong";
    if (selector.startsWith("#") || selector.startsWith("[aria-label="))
      return "medium";
    if (selector.includes(":nth-of-type")) return "weak";
    return "medium";
  }

  function getTargetElement(element) {
    if (!element) return null;
    const control = resolveLabelControl(element);
    if (control) return control;
    const clickable = element.closest(
      'button, a, [role="button"], [role="menuitem"], [role="tab"], [role="link"]',
    );
    if (clickable) return clickable;
    const field = element.closest("input, textarea, select");
    if (field) return field;
    const wrapper = element.closest(
      "label, .form-row, .field, .form-field, [data-field], [data-form-row], [role='group']",
    );
    if (wrapper) {
      const nestedControl = wrapper.querySelector("input, textarea, select");
      if (nestedControl instanceof HTMLElement) return nestedControl;
      return wrapper;
    }
    const nearbyControl = findNearbyFormControl(element);
    if (nearbyControl) return nearbyControl;
    return element;
  }

  function findNearbyFormControl(element) {
    const tagName = element.tagName?.toLowerCase();
    if (!["span", "p", "div", "strong", "em", "small"].includes(tagName)) return null;
    let container = element.parentElement;
    let depth = 0;
    while (container && depth < 2 && !["body", "html"].includes(container.tagName.toLowerCase())) {
      const rect = container.getBoundingClientRect();
      const controls = Array.from(
        container.querySelectorAll("input:not([type='hidden']), textarea, select"),
      ).filter((item) => item instanceof HTMLElement);
      if (controls.length === 1 && container.children.length <= 8 && rect.height <= 260) {
        return controls[0];
      }
      container = container.parentElement;
      depth += 1;
    }
    return null;
  }

  function resolveLabelControl(element) {
    const label = element.closest("label");
    if (!label) return null;
    if (label.control instanceof HTMLElement) return label.control;
    const forId = label.getAttribute("for");
    if (!forId) return null;
    const control = document.getElementById(forId);
    return control instanceof HTMLElement ? control : null;
  }

  function isOverlayElement(element) {
    return Boolean(
      element.closest("#click-guide-overlay-layer") ||
        element.closest("#click-guide-inline-editor") ||
        element.closest("#click-guide-selection-toast") ||
        element.closest("#click-guide-builder-bar") ||
        element.closest("#click-guide-navigation-confirmation"),
    );
  }

  function resolveGuideTargetFromEvent(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const elements = path.filter((item) => item instanceof HTMLElement);
    if (elements.some(isOverlayElement)) return null;
    const source = elements[0] || (event.target instanceof HTMLElement ? event.target : null);
    if (!source) return null;
    const element = getTargetElement(source) || source;
    const selector = getElementSelector(element);
    const confidence = getSelectorConfidence(element, selector);
    const tagName = element.tagName.toLowerCase();
    const hasReliableElement =
      confidence !== "weak" &&
      tagName !== "body" &&
      tagName !== "html" &&
      Math.max(0, element.getBoundingClientRect().width) *
        Math.max(0, element.getBoundingClientRect().height) >
        0;
    return {
      source,
      element,
      anchorMode: hasReliableElement ? "element" : "rect",
      reason: hasReliableElement ? "dom-target" : "visual-rect",
    };
  }

  function captureTarget(element, anchorMode = "element", event, visualSource = element) {
    const rectSource =
      anchorMode === "rect" && visualSource instanceof HTMLElement ? visualSource : element;
    const sourceRect = rectSource.getBoundingClientRect();
    const selector = getElementSelector(element);
    const tagName = element.tagName.toLowerCase();
    const type = element.getAttribute("type") || "";
    const viewportX = Math.round(
      typeof event?.clientX === "number" ? event.clientX : sourceRect.left + sourceRect.width / 2,
    );
    const viewportY = Math.round(
      typeof event?.clientY === "number" ? event.clientY : sourceRect.top + sourceRect.height / 2,
    );
    const rect = getCapturedRect(element, sourceRect, anchorMode, viewportX, viewportY);
    return {
      selector,
      selectorConfidence: getSelectorConfidence(element, selector),
      fallbackText: getFallbackText(element),
      fallbackAriaLabel: safeToken(element.getAttribute("aria-label") || "", 160),
      fallbackRole: safeToken(element.getAttribute("role") || "", 80),
      fallbackTagName: tagName,
      fallbackPath: buildFallbackPath(element),
      id: safeToken(element.id || "", 160),
      classList: safeClassList(element),
      placeholder: safeToken(element.getAttribute("placeholder") || "", 160),
      name: safeToken(element.getAttribute("name") || "", 120),
      type: safeToken(type, 80),
      href: tagName === "a" ? getSafeLinkHref(element) : "",
      pageUrl: normalizeGuideUrl(window.location.href),
      anchorMode,
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        documentX: Math.round(rect.x + window.scrollX),
        documentY: Math.round(rect.y + window.scrollY),
      },
      anchorPoint: {
        viewportX,
        viewportY,
        documentX: Math.round(viewportX + window.scrollX),
        documentY: Math.round(viewportY + window.scrollY),
      },
    };
  }

  function getCapturedRect(element, sourceRect, anchorMode, viewportX, viewportY) {
    const tagName = element.tagName.toLowerCase();
    const isPageSized =
      tagName === "body" ||
      tagName === "html" ||
      sourceRect.width >= window.innerWidth * 0.95 ||
      sourceRect.height >= window.innerHeight * 0.95;
    if (anchorMode === "rect" && isPageSized) {
      const size = 40;
      return {
        x: Math.max(0, viewportX - size / 2),
        y: Math.max(0, viewportY - size / 2),
        width: size,
        height: size,
      };
    }
    return sourceRect;
  }

  function getSafeLinkHref(element) {
    const href = element.getAttribute("href") || "";
    if (!href) return "";
    try {
      return normalizeGuideUrl(new URL(href, window.location.href).href);
    } catch {
      return "";
    }
  }

  function clearHover() {
    if (hoveredElement) hoveredElement.classList.remove("click-guide-hover-highlight");
    hoveredElement = null;
  }

  function ensureOverlayLayer() {
    if (overlayLayer && document.body.contains(overlayLayer)) return overlayLayer;
    overlayLayer = document.createElement("div");
    overlayLayer.id = "click-guide-overlay-layer";
    document.body.appendChild(overlayLayer);
    return overlayLayer;
  }

  function removeInlineEditor() {
    if (inlineEditor) inlineEditor.remove();
    inlineEditor = null;
    document.querySelectorAll(".click-guide-inline-target").forEach((item) => item.remove());
  }

  function clearOverlay() {
    clearHover();
    removeInlineEditor();
    if (overlayLayer) overlayLayer.innerHTML = "";
    clearAdvanceWatcher();
    if (celebrationTimer) clearTimeout(celebrationTimer);
    if (builderPinsRaf) cancelAnimationFrame(builderPinsRaf);
    builderPinsRaf = null;
    celebrationTimer = null;
  }

  function clearBuilderStepPins() {
    document.querySelectorAll(".click-guide-step-pin").forEach((item) => item.remove());
  }

  function preparePlaybackLayer(layer, dimPage) {
    clearBuilderStepPins();
    const existingDimLayer = layer.querySelector("#click-guide-dim-layer");
    if (dimPage && !existingDimLayer) {
      layer.append(elFromHtml(`<div id="click-guide-dim-layer"></div>`));
    }
    if (!dimPage && existingDimLayer) existingDimLayer.remove();
    layer.querySelectorAll(".click-guide-target-highlight, #click-guide-popup").forEach((item) => item.remove());
  }

  function positionDimLayer(layer, rect, rectFallback) {
    const dimLayer = layer.querySelector("#click-guide-dim-layer");
    if (!dimLayer) return;
    const left = rectFallback ? rect.documentX : rect.left + window.scrollX;
    const top = rectFallback ? rect.documentY : rect.top + window.scrollY;
    dimLayer.style.left = `${left}px`;
    dimLayer.style.top = `${top}px`;
    dimLayer.style.width = `${Math.max(8, rect.width)}px`;
    dimLayer.style.height = `${Math.max(8, rect.height)}px`;
  }

  function hideSelectionToast() {
    if (selectionToastTimer) clearTimeout(selectionToastTimer);
    selectionToastTimer = null;
    const toast = document.getElementById("click-guide-selection-toast");
    if (!toast) return false;
    toast.remove();
    return true;
  }

  function clampToViewport(left, top, width, height) {
    const margin = 12;
    return {
      left: Math.max(margin, Math.min(left, window.innerWidth - width - margin)),
      top: Math.max(margin, Math.min(top, window.innerHeight - height - margin)),
    };
  }

  function isElementVisible(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    );
  }

  const genericSelectorClasses = new Set([
    "hide-sm",
    "show-sm",
    "container",
    "wrapper",
    "layout",
    "clearfix",
    "sr-only",
    "visually-hidden",
    "d-flex",
    "flex",
    "grid",
    "row",
    "col",
  ]);

  function hasSavedVisualAnchor(step) {
    const target = step?.target || {};
    const rect = target.rect || {};
    const anchor = target.anchorPoint || {};
    return (
      (Number(rect.width) > 0 && Number(rect.height) > 0) ||
      (Number.isFinite(Number(anchor.documentX)) && Number.isFinite(Number(anchor.documentY)))
    );
  }

  function selectorMatchCount(selector) {
    if (!selector) return 0;
    try {
      return document.querySelectorAll(selector).length;
    } catch {
      return 0;
    }
  }

  function isGenericSelector(selector) {
    const value = String(selector || "").trim();
    if (!value) return true;
    if (/^([a-z][a-z0-9-]*)?\.[a-zA-Z0-9_-]+$/.test(value)) {
      const className = value.split(".").pop();
      return genericSelectorClasses.has(className);
    }
    const classMatches = [...value.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((match) => match[1]);
    return Boolean(classMatches.length) && classMatches.every((item) => genericSelectorClasses.has(item));
  }

  function isResolvedElementTrustworthy(element, step) {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (rect.width >= window.innerWidth * 0.95 || rect.height >= window.innerHeight * 0.95) return false;
    const target = step?.target || {};
    const pageUrl = target.pageUrl || step?.pageUrl || "";
    const samePage = !pageUrl || normalizeGuideUrl(window.location.href) === normalizeGuideUrl(pageUrl);
    if (!samePage) return true;
    const selector = target.selector || "";
    const matchCount = selectorMatchCount(selector);
    const confidence = target.selectorConfidence || "weak";
    const isStrongEnough = ["strong", "medium"].includes(confidence) && matchCount === 1 && !isGenericSelector(selector);
    if (isStrongEnough) return true;
    if (!hasSavedVisualAnchor(step)) return !isGenericSelector(selector) && matchCount <= 1;
    const savedRect = getFallbackRect(step);
    if (!savedRect) return false;
    const liveCenterX = rect.left + rect.width / 2 + window.scrollX;
    const liveCenterY = rect.top + rect.height / 2 + window.scrollY;
    const savedCenterX = savedRect.documentX + savedRect.width / 2;
    const savedCenterY = savedRect.documentY + savedRect.height / 2;
    const distance = Math.hypot(liveCenterX - savedCenterX, liveCenterY - savedCenterY);
    const allowedDistance = Math.max(160, Math.min(window.innerWidth, window.innerHeight) * 0.35);
    if (distance > allowedDistance) return false;
    return !isGenericSelector(selector) && matchCount <= 1;
  }

  function findTargetElement(step) {
    const target = step?.target || {};
    const attempts = [target.selector, target.fallbackPath].filter(Boolean);
    for (const selector of attempts) {
      try {
        const element = document.querySelector(selector);
        if (element instanceof HTMLElement) return element;
      } catch {}
    }
    let candidates = [];
    try {
      candidates = Array.from(
        document.querySelectorAll(target.fallbackTagName || "button, a, input, textarea, select, [role]"),
      ).filter((item) => item instanceof HTMLElement);
    } catch {
      candidates = Array.from(
        document.querySelectorAll("button, a, input, textarea, select, [role]"),
      ).filter((item) => item instanceof HTMLElement);
    }
    if (target.fallbackAriaLabel) {
      const match = candidates.find(
        (item) => item.getAttribute("aria-label") === target.fallbackAriaLabel,
      );
      if (match) return match;
    }
    if (target.fallbackRole && target.fallbackText) {
      const match = candidates.find(
        (item) =>
          item.getAttribute("role") === target.fallbackRole &&
          getTextSnippet(item.innerText || item.textContent || "").includes(target.fallbackText),
      );
      if (match) return match;
    }
    if (target.placeholder) {
      const match = candidates.find(
        (item) => item.getAttribute("placeholder") === target.placeholder,
      );
      if (match) return match;
    }
    if (target.name) {
      const match = candidates.find((item) => item.getAttribute("name") === target.name);
      if (match) return match;
    }
    if (target.type) {
      const match = candidates.find(
        (item) =>
          item.tagName.toLowerCase() === (target.fallbackTagName || "").toLowerCase() &&
          item.getAttribute("type") === target.type,
      );
      if (match) return match;
    }
    if (target.fallbackText) {
      return (
        candidates.find((item) =>
          getTextSnippet(item.innerText || item.textContent || "").includes(target.fallbackText),
        ) || null
      );
    }
    return null;
  }

  function isSafeRectFallback(step) {
    const pageUrl = step?.target?.pageUrl || step?.pageUrl || "";
    return !pageUrl || normalizeGuideUrl(window.location.href) === normalizeGuideUrl(pageUrl);
  }

  function getFallbackRect(step) {
    const target = step?.target || {};
    const rect = target.rect || {};
    const anchor = target.anchorPoint || {};
    if (typeof rect.documentX === "number" && typeof rect.documentY === "number") {
      return {
        left: rect.documentX - window.scrollX,
        top: rect.documentY - window.scrollY,
        right: rect.documentX - window.scrollX + Math.max(8, rect.width || 8),
        bottom: rect.documentY - window.scrollY + Math.max(8, rect.height || 8),
        width: Math.max(8, rect.width || 8),
        height: Math.max(8, rect.height || 8),
        documentX: rect.documentX,
        documentY: rect.documentY,
      };
    }
    if (typeof anchor.documentX === "number" && typeof anchor.documentY === "number") {
      return {
        left: anchor.documentX - window.scrollX - 4,
        top: anchor.documentY - window.scrollY - 4,
        right: anchor.documentX - window.scrollX + 4,
        bottom: anchor.documentY - window.scrollY + 4,
        width: 8,
        height: 8,
        documentX: anchor.documentX - 4,
        documentY: anchor.documentY - 4,
      };
    }
    return null;
  }

  function resolvePlaybackTarget(step, { allowRectFallback = true } = {}) {
    if (step?.target?.anchorMode === "rect") {
      if (!isSafeRectFallback(step)) return null;
      const rect = getFallbackRect(step);
      return rect ? { rect, rectFallback: true } : null;
    }

    const element = findTargetElement(step);
    if (element && isResolvedElementTrustworthy(element, step)) return { element, rectFallback: false };
    if (!allowRectFallback) return null;
    if (!isSafeRectFallback(step)) return null;
    const rect = getFallbackRect(step);
    return rect ? { rect, rectFallback: true } : null;
  }

  async function resolvePlaybackTargetWithRetry(step, renderVersion, shouldRetry) {
    if (!shouldRetry || step?.target?.anchorMode === "rect") return resolvePlaybackTarget(step);
    const timeout = prefersReducedMotion() ? 700 : 3200;
    const deadline = Date.now() + timeout;
    do {
      const exactTarget = resolvePlaybackTarget(step, { allowRectFallback: false });
      if (exactTarget) return exactTarget;
      if (renderVersion !== playbackRenderVersion || !activePlayback) return null;
      await wait(120);
    } while (Date.now() < deadline);
    return resolvePlaybackTarget(step);
  }

  function waitForScrollSettle() {
    if (prefersReducedMotion()) return Promise.resolve();
    return new Promise((resolve) => {
      const startedAt = performance.now();
      let previousX = window.scrollX;
      let previousY = window.scrollY;
      let stableFrames = 0;
      function check() {
        const currentX = window.scrollX;
        const currentY = window.scrollY;
        stableFrames = currentX === previousX && currentY === previousY ? stableFrames + 1 : 0;
        previousX = currentX;
        previousY = currentY;
        const elapsed = performance.now() - startedAt;
        if ((elapsed >= 140 && stableFrames >= 3) || elapsed >= 900) {
          resolve();
          return;
        }
        requestAnimationFrame(check);
      }
      requestAnimationFrame(check);
    });
  }

  function getResolvedTargetRect(resolvedTarget, step) {
    if (resolvedTarget?.element) return resolvedTarget.element.getBoundingClientRect();
    if (resolvedTarget?.rectFallback) return getFallbackRect(step);
    return null;
  }

  function renderBuilderStepPins(guide, activeStepId = "") {
    const layer = ensureOverlayLayer();
    clearBuilderStepPins();
    const currentUrl = normalizeGuideUrl(window.location.href);
    if (!guide?.steps?.length || !currentUrl) return;
    guide.steps.forEach((step, index) => {
      const stepUrl = normalizeGuideUrl(step?.pageUrl || step?.target?.pageUrl || "");
      if (!stepUrl || stepUrl !== currentUrl) return;
      const resolvedTarget = resolvePlaybackTarget(step);
      const rect = getResolvedTargetRect(resolvedTarget, step);
      if (!rect) return;
      const pin = document.createElement("div");
      pin.className = `click-guide-step-pin${step.id === activeStepId ? " click-guide-step-pin-active" : ""}`;
      pin.textContent = String(step.order || index + 1);
      pin.style.left = `${Math.round((resolvedTarget.rectFallback ? rect.documentX : rect.left + window.scrollX) + rect.width / 2)}px`;
      pin.style.top = `${Math.round((resolvedTarget.rectFallback ? rect.documentY : rect.top + window.scrollY) + rect.height / 2)}px`;
      layer.append(pin);
    });
  }

  async function renderBuilderPinsForPending() {
    try {
      const { pendingGuideEdit, guides } = await getLocalStorage({
        pendingGuideEdit: null,
        guides: [],
      });
      const guide = Array.isArray(guides)
        ? guides.find((item) => item.id === pendingGuideEdit?.guideId)
        : null;
      if (!guide) {
        clearBuilderStepPins();
        return;
      }
      renderBuilderStepPins(guide, pendingGuideEdit?.stepId || "");
    } catch {
      clearBuilderStepPins();
    }
  }

  function scheduleBuilderPins() {
    if (!["builder-selecting-target", "editing-step"].includes(mode) || builderPinsRaf) return;
    builderPinsRaf = requestAnimationFrame(() => {
      builderPinsRaf = null;
      renderBuilderPinsForPending();
    });
  }

  function onOverlayPositionChange() {
    scheduleReposition();
    scheduleBuilderPins();
  }

  function enableOverlayPositionListeners() {
    if (overlayPositionListenersActive) return;
    document.addEventListener("scroll", onOverlayPositionChange, { passive: true, capture: true });
    window.addEventListener("resize", onOverlayPositionChange);
    overlayPositionListenersActive = true;
  }

  function disableOverlayPositionListeners() {
    if (!overlayPositionListenersActive) return;
    document.removeEventListener("scroll", onOverlayPositionChange, { capture: true });
    window.removeEventListener("resize", onOverlayPositionChange);
    overlayPositionListenersActive = false;
  }

  function positionPopup(popup, rect, placement) {
    const popupRect = popup.getBoundingClientRect();
    const desired = {
      top: { left: rect.left, top: rect.top - popupRect.height - 14 },
      right: { left: rect.right + 14, top: rect.top },
      bottom: { left: rect.left, top: rect.bottom + 14 },
      left: { left: rect.left - popupRect.width - 14, top: rect.top },
    };
    const order =
      placement === "auto"
        ? ["right", "bottom", "top", "left"]
        : [placement, "right", "bottom", "top", "left"];
    let picked = desired.right;
    for (const key of order) {
      const option = desired[key];
      if (!option) continue;
      if (
        option.left >= 8 &&
        option.top >= 8 &&
        option.left + popupRect.width <= window.innerWidth - 8 &&
        option.top + popupRect.height <= window.innerHeight - 8
      ) {
        picked = option;
        break;
      }
    }
    const clamped = clampToViewport(picked.left, picked.top, popupRect.width, popupRect.height);
    popup.style.left = `${clamped.left}px`;
    popup.style.top = `${clamped.top}px`;
    const pickedPlacement =
      Object.entries(desired).find(([, option]) => option === picked)?.[0] || "right";
    popup.classList.add(`click-guide-placement-${pickedPlacement}`);
    const targetCenterX = rect.left + rect.width / 2;
    const targetCenterY = rect.top + rect.height / 2;
    popup.style.setProperty(
      "--click-guide-arrow-x",
      `${Math.round(Math.max(18, Math.min(targetCenterX - clamped.left, popupRect.width - 18)))}px`,
    );
    popup.style.setProperty(
      "--click-guide-arrow-y",
      `${Math.round(Math.max(18, Math.min(targetCenterY - clamped.top, popupRect.height - 18)))}px`,
    );
  }

  function createNode(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (key === "className") node.className = value;
      else if (key === "textContent") node.textContent = value;
      else if (key.startsWith("on") && typeof value === "function")
        node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value !== undefined && value !== null) node.setAttribute(key, value);
    });
    children.forEach((child) => node.append(child));
    return node;
  }

  function createInlineField(labelText, input) {
    return createNode("label", { className: "click-guide-inline-field" }, [
      createNode("span", { textContent: labelText }),
      input,
    ]);
  }

  function createInlineCheckbox(name, labelText, checked) {
    const input = createNode("input", { type: "checkbox", name });
    input.checked = checked;
    return createNode("label", { className: "click-guide-inline-check" }, [
      input,
      createNode("span", { textContent: labelText }),
    ]);
  }

  function createInlineSelect(name, options, selectedValue) {
    const select = createNode("select", { name });
    options.forEach((item) => {
      const value = typeof item === "string" ? item : item.value;
      const label = typeof item === "string" ? item : item.label;
      const option = createNode("option", { value, textContent: label });
      option.selected = value === selectedValue;
      select.append(option);
    });
    return select;
  }

  function getAnchorRect(selection, payload) {
    if (selection.anchorMode === "rect" && payload?.rect) {
      const left = payload.rect.documentX - window.scrollX;
      const top = payload.rect.documentY - window.scrollY;
      const width = Math.max(8, payload.rect.width || 8);
      const height = Math.max(8, payload.rect.height || 8);
      return {
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height,
        documentX: payload.rect.documentX,
        documentY: payload.rect.documentY,
      };
    }
    const rect = selection.element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: Math.max(8, rect.width),
      height: Math.max(8, rect.height),
      documentX: rect.left + window.scrollX,
      documentY: rect.top + window.scrollY,
    };
  }

  function showInlineTargetHighlight(layer, rect) {
    const highlight = document.createElement("div");
    highlight.className = "click-guide-target-highlight click-guide-inline-target";
    highlight.style.left = `${rect.documentX}px`;
    highlight.style.top = `${rect.documentY}px`;
    highlight.style.width = `${Math.max(8, rect.width)}px`;
    highlight.style.height = `${Math.max(8, rect.height)}px`;
    layer.append(highlight);
  }

  function renderInlineStepEditor(selection, payload, pendingGuideEdit, guide) {
    removeInlineEditor();
    const existing = guide.steps.find((step) => step.id === pendingGuideEdit.stepId);
    const suggestedLinkMatch = deriveSafeUrlMatch(payload?.href, payload?.pageUrl || guide.startUrl);
    const layer = ensureOverlayLayer();
    const rect = getAnchorRect(selection, payload);
    showInlineTargetHighlight(layer, rect);

    const title = createNode("input", {
      type: "text",
      name: "title",
      placeholder: "Step title",
    });
    title.value = existing?.title || "";
    const body = createNode("textarea", {
      name: "body",
      placeholder: "Instruction body",
    });
    body.value = existing?.body || "";
    const showInstructionText =
      (existing?.playback?.showInstructionText ?? existing?.playback?.showPopup) !== false;
    const placement = createInlineSelect(
      "popupPlacement",
      [
        { value: "auto", label: "Best fit" },
        { value: "top", label: "Above" },
        { value: "right", label: "Right" },
        { value: "bottom", label: "Below" },
        { value: "left", label: "Left" },
      ],
      existing?.playback?.popupPlacement || "auto",
    );
    const advanceOptions = [
      { value: "manual", label: "Continue manually" },
      { value: "urlMatch", label: "After opening a page" },
    ];
    if (existing?.advance?.mode === "elementVisible" && existing.advance.value) {
      advanceOptions.push({
        value: "elementVisible",
        label: "When part of the page appears",
      });
    }
    const advanceMode = createInlineSelect(
      "advanceMode",
      advanceOptions,
      existing?.advance?.mode || (suggestedLinkMatch ? "urlMatch" : "manual"),
    );
    const advanceValue = createNode("input", {
      type: "text",
      name: "advanceValue",
      placeholder: "Example: /dashboard",
    });
    advanceValue.value = existing?.advance?.value || (!existing ? suggestedLinkMatch : "");
    const advanceValueField = createInlineField("Page to continue on", advanceValue);
    const updateAdvanceValueVisibility = () => {
      advanceValueField.hidden = advanceMode.value !== "urlMatch";
    };
    advanceMode.addEventListener("change", updateAdvanceValueVisibility);
    updateAdvanceValueVisibility();
    const weakTargetHint =
      payload?.selectorConfidence === "weak"
        ? createNode("div", {
            className: "click-guide-warning",
            textContent:
              "Saved position fallback available. This target may move if the page changes. " +
              "Click Guide will still try to show this step near the saved area.",
          })
        : document.createTextNode("");

    inlineEditor = createNode("form", { id: "click-guide-inline-editor" }, [
      createNode("button", {
        className: "click-guide-close",
        type: "button",
        "aria-label": "Close editor",
        textContent: "x",
        onClick: cancelInlineStepEditor,
      }),
      createNode("div", {
        className: "click-guide-eyebrow",
        textContent: `Step target: ${getTargetDisplayLabel(payload)}`,
      }),
      createNode("h2", { textContent: existing ? "Edit step" : "New step" }),
      weakTargetHint,
      createInlineField("Title", title),
      createInlineField("Body", body),
      createInlineCheckbox("showInstructionText", "Show instruction text", showInstructionText),
      createInlineCheckbox(
        "highlightTarget",
        "Highlight target",
        existing?.playback?.highlightTarget !== false,
      ),
      createInlineCheckbox("autoScroll", "Bring the target into view", existing?.playback?.autoScroll !== false),
      createInlineCheckbox("dimPage", "Dim rest of page", existing?.playback?.dimPage !== false),
      createInlineField("Where instructions appear", placement),
      createInlineField("Move to the next step", advanceMode),
      advanceValueField,
      createNode("div", { className: "click-guide-actions" }, [
        createNode("button", {
          type: "button",
          "data-action": "close",
          textContent: "Cancel",
          onClick: cancelInlineStepEditor,
        }),
        createNode("button", {
          type: "submit",
          "data-action": "next",
          textContent: "Save step",
        }),
      ]),
    ]);
    inlineEditor.addEventListener("click", (event) => event.stopPropagation());
    inlineEditor.addEventListener("submit", (event) =>
      saveInlineStepEditor(event, payload, pendingGuideEdit),
    );
    layer.append(inlineEditor);
    positionPopup(inlineEditor, rect, "auto");
    mode = "editing-step";
    renderBuilderPinsForPending();
    title.focus({ preventScroll: true });
  }

  async function saveInlineStepEditor(event, payload, pendingGuideEdit) {
    event.preventDefault();
    event.stopPropagation();
    if (!upsertGuideStep) {
      showSelectionToast("Could not save step. Reload Click Guide and try again.", 5000);
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    const fields = {
      title: formData.get("title"),
      body: formData.get("body"),
      showInstructionText: formData.get("showInstructionText") === "on",
      highlightTarget: formData.get("highlightTarget") === "on",
      dimPage: formData.get("dimPage") === "on",
      autoScroll: formData.get("autoScroll") === "on",
      popupPlacement: formData.get("popupPlacement"),
      advanceMode: formData.get("advanceMode"),
      advanceValue: formData.get("advanceValue"),
      tabId: pendingGuideEdit.tabId,
    };
    try {
      const { guides } = await getLocalStorage({ guides: [] });
      const nextGuides = Array.isArray(guides) ? guides.slice() : [];
      const guideIndex = nextGuides.findIndex((item) => item.id === pendingGuideEdit.guideId);
      if (guideIndex < 0) {
        showSelectionToast("Guide no longer exists.", 5000);
        return;
      }
      nextGuides[guideIndex] = upsertGuideStep(
        nextGuides[guideIndex],
        payload,
        pendingGuideEdit.stepId,
        fields,
      );
      const savedGuide = nextGuides[guideIndex];
      const savedStep = pendingGuideEdit.stepId
        ? savedGuide.steps.find((step) => step.id === pendingGuideEdit.stepId)
        : savedGuide.steps[savedGuide.steps.length - 1];
      const builderSession = createBuilderResumeSession
        ? createBuilderResumeSession(pendingGuideEdit.guideId, fields)
        : null;
      const pendingNavigationConfirmation =
        savedStep?.advance?.mode !== "manual" || !createPendingNavigationConfirmation
          ? null
          : createPendingNavigationConfirmation(
              pendingGuideEdit.guideId,
              savedStep?.id,
              window.location.href,
              pendingGuideEdit.tabId,
            );
      await setLocalStorage({
        guides: nextGuides,
        ...(builderSession ? { activeBuilderSession: builderSession } : {}),
        ...(pendingNavigationConfirmation ? { pendingNavigationConfirmation } : {}),
      });
      await removeLocalStorage([
        "pendingGuideEdit",
        "selectedGuideTarget",
        ...(builderSession ? [] : ["activeBuilderSession"]),
        ...(pendingNavigationConfirmation ? [] : ["pendingNavigationConfirmation"]),
      ]);
      removeInlineEditor();
      mode = "idle";
      if (builderSession?.status === "waitingForUrl") {
        showBuilderBar("Step saved. Continue to the next page.");
        watchBuilderResumeSession();
      } else if (builderSession) {
        showSelectionToast("Step saved. Select the next target or click Done.", 2400);
        showBuilderBar("Select the next target");
        resumeBuilderSessionIfReady();
      } else {
        clearBuilderUrlWatch();
        showSelectionToast("Step saved.", 2400);
      }
    } catch {
      showSelectionToast("Could not save step.", 5000);
    }
  }

  async function cancelInlineStepEditor() {
    removeInlineEditor();
    mode = "idle";
    clearBuilderUrlWatch();
    disableOverlayPositionListeners();
    clearBuilderStepPins();
    removeNavigationConfirmationPanel();
    await removeLocalStorage([
      "pendingGuideEdit",
      "selectedGuideTarget",
      "activeBuilderSession",
      "pendingNavigationConfirmation",
    ]);
    hideSelectionToast();
    removeBuilderBar();
    removeNavigationConfirmationPanel();
  }

  async function resumeBuilderSessionIfReady() {
    if (mode !== "idle" || !shouldResumeBuilderSession) return;
    try {
      const { activeBuilderSession, guides } = await getLocalStorage({
        activeBuilderSession: null,
        guides: [],
      });
      if (!activeBuilderSession) {
        clearBuilderUrlWatch();
        return;
      }
      if (!shouldResumeBuilderSession(activeBuilderSession, window.location.href)) return;
      const guide = Array.isArray(guides)
        ? guides.find((item) => item.id === activeBuilderSession.guideId)
        : null;
      if (!guide) {
        clearBuilderUrlWatch();
        await removeLocalStorage("activeBuilderSession");
        return;
      }
      clearBuilderUrlWatch();
      await setLocalStorage({
        pendingGuideEdit: {
          guideId: activeBuilderSession.guideId,
          stepId: "",
          tabId: activeBuilderSession.tabId,
        },
      });
      await removeLocalStorage(["activeBuilderSession", "selectedGuideTarget"]);
      const matchedMessage = activeBuilderSession.status === "waitingForUrl"
        ? "URL matched. Select the next target."
        : "Select the next target";
      if (activeBuilderSession.status === "waitingForUrl") {
        showSelectionToast("URL matched. Select the next target.", 2400);
      }
      startSelectMode(matchedMessage);
    } catch {}
  }

  function removeNavigationConfirmationPanel() {
    document.getElementById("click-guide-navigation-confirmation")?.remove();
  }

  async function confirmNavigationCompletion(pending, safeUrlMatch) {
    try {
      const { guides } = await getLocalStorage({ guides: [] });
      const nextGuides = Array.isArray(guides) ? guides.slice() : [];
      const guideIndex = nextGuides.findIndex((guide) => guide.id === pending.guideId);
      const guide = guideIndex >= 0 ? nextGuides[guideIndex] : null;
      const stepIndex = guide?.steps?.findIndex((step) => step.id === pending.stepId) ?? -1;
      if (!guide || stepIndex < 0) {
        await removeLocalStorage("pendingNavigationConfirmation");
        removeNavigationConfirmationPanel();
        return;
      }
      const steps = guide.steps.slice();
      steps[stepIndex] = {
        ...steps[stepIndex],
        advance: { mode: "urlMatch", value: safeUrlMatch, allowManualFallback: true },
      };
      nextGuides[guideIndex] = { ...guide, steps, updatedAt: new Date().toISOString() };
      await setLocalStorage({
        guides: nextGuides,
        activeBuilderSession: {
          guideId: pending.guideId,
          status: "selecting",
          tabId: pending.tabId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      await removeLocalStorage("pendingNavigationConfirmation");
      removeNavigationConfirmationPanel();
      showSelectionToast("Page change saved. Select the next target or click Done.", 2400);
      startSelectMode("Select the next target");
    } catch {
      showSelectionToast("Could not save page change.", 5000);
    }
  }

  async function declineNavigationCompletion(pending) {
    try {
      await setLocalStorage({
        activeBuilderSession: {
          guideId: pending.guideId,
          status: "selecting",
          tabId: pending.tabId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      await removeLocalStorage("pendingNavigationConfirmation");
      removeNavigationConfirmationPanel();
      showSelectionToast("Step kept manual. Select the next target or click Done.", 2400);
      startSelectMode("Select the next target");
    } catch {
      showSelectionToast("Could not keep step manual.", 5000);
    }
  }

  function renderNavigationConfirmation(pending, safeUrlMatch) {
    removeNavigationConfirmationPanel();
    showBuilderBar("Select the next target or click Done");
    const panel = createNode("div", { id: "click-guide-navigation-confirmation" }, [
      createNode("strong", { textContent: "The page changed after this step." }),
      createNode("span", {
        textContent: "Should this step complete when the user reaches this page?",
      }),
      createNode("div", { className: "click-guide-actions" }, [
        createNode("button", {
          type: "button",
          textContent: "Yes, use this page change",
          onClick: () => confirmNavigationCompletion(pending, safeUrlMatch),
        }),
        createNode("button", {
          type: "button",
          textContent: "No, keep manual",
          onClick: () => declineNavigationCompletion(pending),
        }),
      ]),
    ]);
    panel.addEventListener("click", (event) => event.stopPropagation());
    document.body.appendChild(panel);
  }

  async function checkPendingNavigationConfirmation() {
    if (mode === "playing-guide" || !shouldShowNavigationConfirmation) return;
    try {
      const { pendingNavigationConfirmation, guides } = await getLocalStorage({
        pendingNavigationConfirmation: null,
        guides: [],
      });
      if (!pendingNavigationConfirmation) return;
      if (!shouldShowNavigationConfirmation(pendingNavigationConfirmation, window.location.href)) {
        if (Number(pendingNavigationConfirmation.expiresAt) <= Date.now()) {
          await removeLocalStorage("pendingNavigationConfirmation");
        }
        return;
      }
      const guide = Array.isArray(guides)
        ? guides.find((item) => item.id === pendingNavigationConfirmation.guideId)
        : null;
      const step = guide?.steps?.find((item) => item.id === pendingNavigationConfirmation.stepId);
      if (!step || step.advance?.mode === "urlMatch") {
        await removeLocalStorage("pendingNavigationConfirmation");
        return;
      }
      const safeUrlMatch = deriveSafeUrlMatch(window.location.href);
      if (!safeUrlMatch) {
        await removeLocalStorage("pendingNavigationConfirmation");
        return;
      }
      mode = "navigation-confirmation";
      renderNavigationConfirmation(pendingNavigationConfirmation, safeUrlMatch);
    } catch {}
  }

  function renderMissingStep(step) {
    const layer = ensureOverlayLayer();
    layer.innerHTML = "";
    const card = document.createElement("div");
    card.id = "click-guide-popup";
    card.className = "click-guide-missing";
    card.innerHTML = `
      <button class="click-guide-close" type="button" aria-label="Close">x</button>
      <h2>Target not found</h2>
      <p>This part of the page may have changed or not loaded yet.</p>
      <div class="click-guide-actions">
        <button type="button" data-action="retry">Retry</button>
        <button type="button" data-action="skip">Skip step</button>
        <button type="button" data-action="close">Close guide</button>
      </div>
    `;
    layer.append(card);
    card.style.left = `${Math.max(12, window.innerWidth / 2 - 160)}px`;
    card.style.top = `${Math.max(12, window.innerHeight / 2 - 110)}px`;
    card.addEventListener("click", (event) => {
      const action = event.target?.dataset?.action;
      if (event.target?.classList?.contains("click-guide-close") || action === "close")
        stopPlayback();
      if (action === "retry") renderPlaybackStep({ waitForTarget: true });
      if (action === "skip") goToStep(activePlayback.stepIndex + 1);
    });
  }

  function showCompletionCelebration() {
    clearPersistedPlayback();
    mode = "idle";
    activePlayback = null;
    disableOverlayPositionListeners();
    if (urlWatchTimer) clearInterval(urlWatchTimer);
    urlWatchTimer = null;
    const layer = ensureOverlayLayer();
    layer.innerHTML = "";
    const celebration = document.createElement("div");
    celebration.id = "click-guide-celebration";
    celebration.setAttribute("role", "status");
    const iconUrl = chrome.runtime.getURL("icons/icon128.png");
    celebration.innerHTML = `
      <div class="click-guide-finish-visual" aria-hidden="true">
        <img class="click-guide-finish-logo" src="${iconUrl}" alt="" />
        <span class="click-guide-finish-halo"></span>
        <span class="click-guide-finish-bridge-dot"></span>
        <svg class="click-guide-finish-check" viewBox="0 0 120 90" aria-hidden="true" focusable="false">
          <path d="M16 48 L43 74 L104 14"></path>
        </svg>
      </div>
      <div class="click-guide-finish-copy">
        <strong>Guide complete</strong>
        <span>Nice work.</span>
      </div>
    `;
    layer.append(celebration);
    celebrationTimer = setTimeout(clearOverlay, 3600);
  }

  async function renderPlaybackStep({ autoScroll = true, waitForTarget = false } = {}) {
    if (!activePlayback) return;
    const renderVersion = ++playbackRenderVersion;
    if (autoScroll) isPlaybackPreparing = true;
    const { guide, stepIndex } = activePlayback;
    const step = guide.steps[stepIndex];
    if (!step) return stopPlayback();
    const isLastStep = stepIndex >= guide.steps.length - 1;
    const resolvedTarget = await resolvePlaybackTargetWithRetry(step, renderVersion, waitForTarget);
    if (renderVersion !== playbackRenderVersion || !activePlayback) return;
    if (!resolvedTarget) {
      isPlaybackPreparing = false;
      renderMissingStep(step);
      return;
    }
    if (autoScroll && resolvedTarget.element && step.playback?.autoScroll !== false && !isElementVisible(resolvedTarget.element)) {
      resolvedTarget.element.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "center",
        inline: "nearest",
      });
      await waitForScrollSettle();
    }
    if (autoScroll && resolvedTarget.rectFallback && step.playback?.autoScroll !== false) {
      window.scrollTo({
        top: Math.max(0, resolvedTarget.rect.documentY - window.innerHeight / 2),
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
      await waitForScrollSettle();
    }
    if (renderVersion !== playbackRenderVersion || !activePlayback) return;

    const layer = ensureOverlayLayer();
    const rect = getResolvedTargetRect(resolvedTarget, step);
    preparePlaybackLayer(layer, Boolean(step.playback?.dimPage));
    positionDimLayer(layer, rect, resolvedTarget.rectFallback);
    if (step.playback?.highlightTarget !== false) {
      const highlight = document.createElement("div");
      highlight.className = `click-guide-target-highlight${resolvedTarget.rectFallback ? " click-guide-target-highlight-saved" : ""}`;
      highlight.style.left = `${resolvedTarget.rectFallback ? rect.documentX : rect.left + window.scrollX}px`;
      highlight.style.top = `${resolvedTarget.rectFallback ? rect.documentY : rect.top + window.scrollY}px`;
      highlight.style.width = `${Math.max(8, rect.width)}px`;
      highlight.style.height = `${Math.max(8, rect.height)}px`;
      layer.append(highlight);
    }
    {
      const popup = document.createElement("div");
      popup.id = "click-guide-popup";
      const compact = step.playback?.showInstructionText === false || step.playback?.showPopup === false;
      const isAutoAdvance = step.advance?.mode && step.advance.mode !== "manual";
      if (compact) popup.className = "click-guide-compact";
      popup.innerHTML = compact
        ? `
          <button class="click-guide-close" type="button" aria-label="Close guide">x</button>
          <div class="click-guide-card-body">
            <div class="click-guide-count"></div>
            <div class="click-guide-warning" hidden></div>
          </div>
          <div class="click-guide-footer">
            <button class="click-guide-back-button" type="button" data-action="prev"><span class="click-guide-back-icon">←</span>Previous</button>
            <button type="button" data-action="close">Close guide</button>
            <button type="button" data-action="next">Continue →</button>
          </div>
        `
        : `
          <button class="click-guide-close" type="button" aria-label="Close guide">x</button>
          <div class="click-guide-card-body">
            <div class="click-guide-count"></div>
            <h2></h2>
            <p></p>
            <div class="click-guide-warning" hidden></div>
          </div>
          <div class="click-guide-footer">
            <button class="click-guide-back-button" type="button" data-action="prev"><span class="click-guide-back-icon">←</span>Previous</button>
            <button type="button" data-action="close">Close guide</button>
            <button type="button" data-action="next">Continue →</button>
          </div>
        `;
      if (!compact) {
        popup.querySelector("h2").textContent = step.title || "Untitled step";
        popup.querySelector("p").textContent = step.body || "";
      }
      if (resolvedTarget.rectFallback) {
        const warning = popup.querySelector(".click-guide-warning");
        warning.hidden = false;
        warning.textContent = "Showing the saved position for this step.";
      }
      popup.querySelector(".click-guide-count").textContent = `Step ${stepIndex + 1} of ${guide.steps.length}`;
      popup.querySelector('[data-action="prev"]').disabled = stepIndex === 0;
      const nextButton = popup.querySelector('[data-action="next"]');
      nextButton.textContent =
        stepIndex >= guide.steps.length - 1
          ? "Finish"
          : isAutoAdvance
            ? "Continue anyway →"
            : "Continue →";
      layer.append(popup);
      positionPopup(popup, rect, step.playback?.popupPlacement || "auto");
      popup.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const action = event.target?.closest("[data-action]")?.dataset?.action;
        if (event.target?.classList?.contains("click-guide-close")) stopPlayback();
        if (action === "prev") goToStep(activePlayback.stepIndex - 1);
        if (action === "next") goToStep(activePlayback.stepIndex + 1);
        if (action === "close") stopPlayback();
      });
    }
    isPlaybackPreparing = false;
    if (!isLastStep) watchAdvanceMode(step);
    else clearAdvanceWatcher();
  }

  function elFromHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function watchAdvanceMode(step) {
    clearAdvanceWatcher();
    if (!activePlayback) return;
    const watchedStepIndex = activePlayback.stepIndex;
    if (step.advance?.mode === "elementVisible" && step.advance?.value) {
      urlWatchTimer = setInterval(() => {
        if (!activePlayback || activePlayback.stepIndex !== watchedStepIndex) return clearAdvanceWatcher();
        try {
          const element = document.querySelector(step.advance.value);
          if (element instanceof HTMLElement && isElementVisible(element))
            goToStep(watchedStepIndex + 1, { waitForTarget: true });
        } catch {}
      }, 600);
      return;
    }
    if (step.advance?.mode !== "urlMatch" || !step.advance?.value) return;
    urlWatchTimer = setInterval(() => {
      if (!activePlayback || activePlayback.stepIndex !== watchedStepIndex) return clearAdvanceWatcher();
      if (matchesAdvanceUrl(window.location.href, step.advance.value)) {
        goToStep(watchedStepIndex + 1, { waitForTarget: true });
      }
    }, 600);
  }

  async function goToStep(stepIndex, { waitForTarget = false } = {}) {
    if (!activePlayback) return;
    if (stepIndex < 0) return;
    clearAdvanceWatcher();
    playbackRenderVersion += 1;
    isPlaybackPreparing = false;
    if (stepIndex >= activePlayback.guide.steps.length) return showCompletionCelebration();
    const nextStep = activePlayback.guide.steps[stepIndex];
    const nextPage = nextStep?.pageUrl || activePlayback.guide.startUrl;
    const safeNextPage = normalizeGuideUrl(nextPage);
    activePlayback.stepIndex = stepIndex;
    await persistActivePlayback();
    if (!activePlayback || activePlayback.stepIndex !== stepIndex) return;
    if (safeNextPage && normalizeGuideUrl(window.location.href) !== safeNextPage) {
      window.location.assign(safeNextPage);
      return;
    }
    renderPlaybackStep({ waitForTarget });
  }

  function stopPlayback() {
    clearPersistedPlayback();
    mode = "idle";
    activePlayback = null;
    disableOverlayPositionListeners();
    clearOverlay();
  }

  function scheduleReposition() {
    if (repositionRaf || mode !== "playing-guide" || isPlaybackPreparing) return;
    repositionRaf = requestAnimationFrame(() => {
      repositionRaf = null;
      renderPlaybackStep({ autoScroll: false });
    });
  }

  function startSelectMode(message = "Choose what this step should point to") {
    stopPlayback();
    mode = "builder-selecting-target";
    enableOverlayPositionListeners();
    lastBuilderPinsUrl = normalizeGuideUrl(window.location.href);
    showBuilderBar(message === "Choose what this step should point to" ? "Select the next target" : message);
    renderBuilderPinsForPending();
    showSelectionToast(message);
  }

  function showBuilderBar(message = "Select the next target") {
    document.getElementById("click-guide-builder-bar")?.remove();
    const bar = createNode("div", { id: "click-guide-builder-bar" }, [
      createNode("div", { className: "click-guide-builder-text" }, [
        createNode("strong", { textContent: "Editing guide" }),
        createNode("span", { textContent: message }),
      ]),
      createNode("button", { type: "button", textContent: "Done", onClick: finishBuilderSession }),
      createNode("button", { type: "button", textContent: "Exit editing", onClick: cancelSelectMode }),
    ]);
    bar.addEventListener("click", (event) => event.stopPropagation());
    document.body.appendChild(bar);
  }

  function removeBuilderBar() {
    document.getElementById("click-guide-builder-bar")?.remove();
  }

  function showSelectionToast(message, durationMs = 0) {
    hideSelectionToast();
    const toast = document.createElement("div");
    toast.id = "click-guide-selection-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    if (durationMs > 0) {
      selectionToastTimer = setTimeout(hideSelectionToast, durationMs);
    }
  }

  async function finishBuilderSession() {
    mode = "idle";
    clearHover();
    clearBuilderUrlWatch();
    disableOverlayPositionListeners();
    removeInlineEditor();
    removeBuilderBar();
    removeNavigationConfirmationPanel();
    clearBuilderStepPins();
    await removeLocalStorage([
      "pendingGuideEdit",
      "selectedGuideTarget",
      "activeBuilderSession",
      "pendingNavigationConfirmation",
    ]);
    showSelectionToast("Guide editing finished.", 2400);
  }

  function cancelSelectMode() {
    mode = "idle";
    clearHover();
    hideSelectionToast();
    removeBuilderBar();
    clearBuilderStepPins();
    clearBuilderUrlWatch();
    disableOverlayPositionListeners();
    safeStorage(() =>
      chrome.storage.local.remove([
        "pendingGuideEdit",
        "selectedGuideTarget",
        "activeBuilderSession",
        "pendingNavigationConfirmation",
      ]),
    );
  }

  async function finishSelectMode(selection, event) {
    const payload = captureTarget(selection.element, selection.anchorMode, event, selection.source);
    mode = "idle";
    clearHover();
    try {
      await removeLocalStorage("pendingNavigationConfirmation");
      await setLocalStorage({ selectedGuideTarget: payload });
      const { pendingGuideEdit, guides } = await getLocalStorage({
        pendingGuideEdit: null,
        guides: [],
      });
      const guide = Array.isArray(guides)
        ? guides.find((item) => item.id === pendingGuideEdit?.guideId)
        : null;
      if (pendingGuideEdit && guide && upsertGuideStep) {
        renderInlineStepEditor(selection, payload, pendingGuideEdit, guide);
        return;
      }
    } catch {}
    showSelectionToast(
      `${getTargetDisplayLabel(payload)} selected. Open Click Guide to write this step.`,
      6000,
    );
  }

  function onMouseMove(event) {
    if (mode !== "builder-selecting-target") return;
    const selection = resolveGuideTargetFromEvent(event);
    if (!selection) return;
    const resolved = selection.element;
    if (hoveredElement !== resolved) {
      clearHover();
      hoveredElement = resolved;
      hoveredElement.classList.add("click-guide-hover-highlight");
    }
  }

  function onClick(event) {
    if (mode !== "builder-selecting-target") return;
    const selection = resolveGuideTargetFromEvent(event);
    if (!selection) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    finishSelectMode(selection, event);
  }

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && mode === "builder-selecting-target") {
        cancelSelectMode();
        return;
      }
      if (event.key === "Escape" && mode === "editing-step") {
        cancelInlineStepEditor();
        return;
      }
      if (event.key === "Escape") hideSelectionToast();
      if (event.key === "Escape" && mode === "playing-guide") stopPlayback();
    },
    true,
  );
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "CLICK_GUIDE_PING") {
      sendResponse({ loaded: true, mode });
      return true;
    }
    if (message.type === "CLICK_GUIDE_SELECT_STEP_TARGET") {
      startSelectMode();
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === "CLICK_GUIDE_START_PLAYBACK") {
      mode = "playing-guide";
      enableOverlayPositionListeners();
      activePlayback = { guide: message.guide, stepIndex: message.stepIndex || 0, tabId: message.tabId };
      persistActivePlayback();
      renderPlaybackStep({ waitForTarget: true }).then(() => sendResponse({ ok: true }));
      return true;
    }
    if (message.type === "CLICK_GUIDE_STOP_PLAYBACK") {
      stopPlayback();
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });

  safeStorage(() =>
    chrome.storage.local.get({ activePlayback: null }).then(({ activePlayback: stored }) => {
      if (!stored?.guide) return;
      getCurrentTabId().then((currentTabId) => {
        if (Number.isInteger(stored.tabId) && currentTabId !== stored.tabId) return;
        mode = "playing-guide";
        enableOverlayPositionListeners();
        const stepIndex = getPlaybackResumeStepIndex(
          stored.guide,
          stored.stepIndex || 0,
          window.location.href,
        );
        activePlayback = { guide: stored.guide, stepIndex, tabId: stored.tabId };
        persistActivePlayback();
        renderPlaybackStep({ waitForTarget: true });
      });
    }),
  );

  safeStorage(() => {
    checkPendingNavigationConfirmation();
    resumeBuilderSessionIfReady();
    watchBuilderResumeSession();
  });
})();
