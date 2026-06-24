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

  let mode = "idle";
  let hoveredElement = null;
  let overlayLayer = null;
  let activePlayback = null;
  let repositionRaf = null;
  let urlWatchTimer = null;
  let selectionToastTimer = null;

  function safeStorage(fn) {
    try {
      if (!chrome?.runtime?.id) return;
      fn();
    } catch (e) {
      if (e?.message?.includes("Extension context invalidated")) return;
      throw e;
    }
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
        element.closest("#click-guide-selection-toast"),
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
      element,
      anchorMode: hasReliableElement ? "element" : "rect",
      reason: hasReliableElement ? "dom-target" : "visual-rect",
    };
  }

  function captureTarget(element, anchorMode = "element", event) {
    const sourceRect = element.getBoundingClientRect();
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

  function clearOverlay() {
    clearHover();
    if (overlayLayer) overlayLayer.innerHTML = "";
    if (urlWatchTimer) clearInterval(urlWatchTimer);
    urlWatchTimer = null;
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

  function resolvePlaybackTarget(step) {
    if (step?.target?.anchorMode === "rect") {
      if (!isSafeRectFallback(step)) return null;
      const rect = getFallbackRect(step);
      return rect ? { rect, rectFallback: true } : null;
    }

    const element = findTargetElement(step);
    if (element) return { element, rectFallback: false };
    if (!isSafeRectFallback(step)) return null;
    const rect = getFallbackRect(step);
    return rect ? { rect, rectFallback: true } : null;
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
  }

  function renderMissingStep(step) {
    const layer = ensureOverlayLayer();
    layer.innerHTML = "";
    const card = document.createElement("div");
    card.id = "click-guide-popup";
    card.className = "click-guide-missing";
    card.innerHTML = `
      <button class="click-guide-close" type="button" aria-label="Close">x</button>
      <h2>Element not found</h2>
      <p>This step may be outdated or the page may not have loaded yet.</p>
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
      if (action === "retry") renderPlaybackStep();
      if (action === "skip") goToStep(activePlayback.stepIndex + 1);
    });
  }

  async function renderPlaybackStep() {
    if (!activePlayback) return;
    const { guide, stepIndex } = activePlayback;
    const step = guide.steps[stepIndex];
    if (!step) return stopPlayback();
    const resolvedTarget = resolvePlaybackTarget(step);
    if (!resolvedTarget) {
      renderMissingStep(step);
      return;
    }
    if (resolvedTarget.element && step.playback?.autoScroll !== false && !isElementVisible(resolvedTarget.element)) {
      resolvedTarget.element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      await new Promise((resolve) => setTimeout(resolve, 420));
    }
    if (resolvedTarget.rectFallback && step.playback?.autoScroll !== false) {
      window.scrollTo({
        top: Math.max(0, resolvedTarget.rect.documentY - window.innerHeight / 2),
        behavior: "smooth",
      });
      await new Promise((resolve) => setTimeout(resolve, 420));
    }

    const layer = ensureOverlayLayer();
    layer.innerHTML = "";
    const rect = resolvedTarget.element
      ? resolvedTarget.element.getBoundingClientRect()
      : getFallbackRect(step);
    if (step.playback?.dimPage) {
      layer.append(elFromHtml(`<div id="click-guide-dim-layer"></div>`));
    }
    if (step.playback?.highlightTarget !== false) {
      const highlight = document.createElement("div");
      highlight.className = "click-guide-target-highlight";
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
          <div class="click-guide-count"></div>
          <div class="click-guide-actions">
            <button type="button" data-action="prev">Previous</button>
            <button type="button" data-action="close">Close guide</button>
            <button type="button" data-action="next">Next</button>
          </div>
        `
        : `
          <button class="click-guide-close" type="button" aria-label="Close guide">x</button>
          <div class="click-guide-eyebrow">Click Guide</div>
          <h2></h2>
          <p></p>
          <div class="click-guide-warning" hidden></div>
          <div class="click-guide-count"></div>
          <div class="click-guide-actions">
            <button type="button" data-action="prev">Previous</button>
            <button type="button" data-action="close">Close guide</button>
            <button type="button" data-action="next">Next</button>
          </div>
        `;
      if (!compact) {
        popup.querySelector("h2").textContent = step.title || "Untitled step";
        popup.querySelector("p").textContent = step.body || "";
        if (resolvedTarget.rectFallback) {
          const warning = popup.querySelector(".click-guide-warning");
          warning.hidden = false;
          warning.textContent = "Original element not found. Showing saved position.";
        }
      }
      popup.querySelector(".click-guide-count").textContent = `Step ${stepIndex + 1} of ${guide.steps.length}`;
      popup.querySelector('[data-action="prev"]').disabled = stepIndex === 0;
      const nextButton = popup.querySelector('[data-action="next"]');
      nextButton.textContent =
        stepIndex >= guide.steps.length - 1 ? "Finish" : isAutoAdvance ? "Continue anyway" : "Next";
      layer.append(popup);
      positionPopup(popup, rect, step.playback?.popupPlacement || "auto");
      popup.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const action = event.target?.dataset?.action;
        if (event.target?.classList?.contains("click-guide-close")) stopPlayback();
        if (action === "prev") goToStep(activePlayback.stepIndex - 1);
        if (action === "next") goToStep(activePlayback.stepIndex + 1);
        if (action === "close") stopPlayback();
      });
    }
    watchAdvanceMode(step);
  }

  function elFromHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function watchAdvanceMode(step) {
    if (urlWatchTimer) clearInterval(urlWatchTimer);
    urlWatchTimer = null;
    if (step.advance?.mode === "elementVisible" && step.advance?.value) {
      urlWatchTimer = setInterval(() => {
        try {
          const element = document.querySelector(step.advance.value);
          if (element instanceof HTMLElement && isElementVisible(element))
            goToStep(activePlayback.stepIndex + 1);
        } catch {}
      }, 600);
      return;
    }
    if (step.advance?.mode !== "urlMatch" || !step.advance?.value) return;
    urlWatchTimer = setInterval(() => {
      if (window.location.href.includes(step.advance.value)) goToStep(activePlayback.stepIndex + 1);
    }, 600);
  }

  function goToStep(stepIndex) {
    if (!activePlayback) return;
    if (stepIndex < 0) return;
    if (stepIndex >= activePlayback.guide.steps.length) return stopPlayback();
    const nextStep = activePlayback.guide.steps[stepIndex];
    const nextPage = nextStep?.pageUrl || activePlayback.guide.startUrl;
    const safeNextPage = normalizeGuideUrl(nextPage);
    if (safeNextPage && normalizeGuideUrl(window.location.href) !== safeNextPage) {
      safeStorage(() =>
        chrome.storage.local.set({
          activePlayback: {
            guide: activePlayback.guide,
            stepIndex,
            tabId: activePlayback.tabId,
          },
        }),
      );
      window.location.assign(safeNextPage);
      return;
    }
    activePlayback.stepIndex = stepIndex;
    renderPlaybackStep();
  }

  function stopPlayback() {
    mode = "idle";
    activePlayback = null;
    clearOverlay();
  }

  function scheduleReposition() {
    if (repositionRaf || mode !== "playing-guide") return;
    repositionRaf = requestAnimationFrame(() => {
      repositionRaf = null;
      renderPlaybackStep();
    });
  }

  function startSelectMode() {
    stopPlayback();
    mode = "builder-selecting-target";
    showSelectionToast("Select an element for this guide step");
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

  function cancelSelectMode() {
    mode = "idle";
    clearHover();
    hideSelectionToast();
    safeStorage(() => chrome.storage.local.remove(["pendingGuideEdit", "selectedGuideTarget"]));
  }

  function finishSelectMode(selection, event) {
    const payload = captureTarget(selection.element, selection.anchorMode, event);
    mode = "idle";
    clearHover();
    safeStorage(() => chrome.storage.local.set({ selectedGuideTarget: payload }));
    showSelectionToast(
      `${selection.anchorMode === "rect" ? "Visual area" : "Element"} selected. Open Click Guide to write this step.`,
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
      if (event.key === "Escape") hideSelectionToast();
      if (event.key === "Escape" && mode === "playing-guide") stopPlayback();
    },
    true,
  );
  document.addEventListener("scroll", scheduleReposition, { passive: true, capture: true });
  window.addEventListener("resize", scheduleReposition);

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
      activePlayback = { guide: message.guide, stepIndex: message.stepIndex || 0, tabId: message.tabId };
      renderPlaybackStep().then(() => sendResponse({ ok: true }));
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
      chrome.storage.local.remove("activePlayback");
      mode = "playing-guide";
      activePlayback = { guide: stored.guide, stepIndex: stored.stepIndex || 0, tabId: stored.tabId };
      renderPlaybackStep();
    }),
  );
})();
