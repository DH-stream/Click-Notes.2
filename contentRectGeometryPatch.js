(() => {
  if (window.__CLICK_GUIDE_RECT_GEOMETRY_PATCHED__) return;
  window.__CLICK_GUIDE_RECT_GEOMETRY_PATCHED__ = true;

  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  let activeVisualRectOverride = null;

  function cloneRect(rect) {
    const snapshot = {
      x: rect.x,
      y: rect.y,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
    if (typeof DOMRect === "function") {
      return new DOMRect(snapshot.x, snapshot.y, snapshot.width, snapshot.height);
    }
    return snapshot;
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

  function cssEscape(value) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
    return String(value || "").replace(/(["\\#.:[\]\s>+~])/g, "\\$1");
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

  function buildFallbackPath(element) {
    const segments = [];
    let current = element;
    let depth = 0;
    while (current && current.nodeType === Node.ELEMENT_NODE && depth < 5) {
      const tag = current.tagName.toLowerCase();
      if (current.id) {
        segments.unshift(`${tag}#${cssEscape(current.id)}`);
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
      if (value) return `[${attrName}="${cssEscape(value)}"]`;
    }
    if (element.id && !/^\d/.test(element.id) && !isLikelyGeneratedClassName(element.id)) {
      return `#${cssEscape(element.id)}`;
    }
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) return `[aria-label="${cssEscape(ariaLabel)}"]`;
    const stableClass = getStableClass(element);
    if (stableClass) return `${element.tagName.toLowerCase()}.${cssEscape(stableClass)}`;
    return buildFallbackPath(element) || element.tagName.toLowerCase();
  }

  function getSelectorConfidence(element, selector) {
    if (
      element.dataset?.guideId ||
      element.dataset?.note ||
      element.dataset?.component ||
      element.dataset?.testid ||
      element.dataset?.cy
    ) {
      return "strong";
    }
    if (selector.startsWith("#") || selector.startsWith("[aria-label=")) return "medium";
    if (selector.includes(":nth-of-type")) return "weak";
    return "medium";
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

  function findNearbyFormControl(element) {
    const tagName = element.tagName?.toLowerCase();
    if (!["span", "p", "div", "strong", "em", "small"].includes(tagName)) return null;
    let container = element.parentElement;
    let depth = 0;
    while (container && depth < 2 && !["body", "html"].includes(container.tagName.toLowerCase())) {
      const rect = originalGetBoundingClientRect.call(container);
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

  function isReliableDomTarget(element) {
    if (!(element instanceof HTMLElement)) return false;
    const rect = originalGetBoundingClientRect.call(element);
    const selector = getElementSelector(element);
    const confidence = getSelectorConfidence(element, selector);
    const tagName = element.tagName.toLowerCase();
    return (
      confidence !== "weak" &&
      tagName !== "body" &&
      tagName !== "html" &&
      Math.max(0, rect.width) * Math.max(0, rect.height) > 0
    );
  }

  function clearOverrideSoon(snapshot) {
    setTimeout(() => {
      if (activeVisualRectOverride === snapshot) activeVisualRectOverride = null;
    }, 0);
  }

  document.addEventListener(
    "click",
    (event) => {
      if (!document.getElementById("click-guide-builder-bar")) return;
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      const elements = path.filter((item) => item instanceof HTMLElement);
      if (elements.some(isOverlayElement)) return;
      const source = elements[0] || (event.target instanceof HTMLElement ? event.target : null);
      if (!source) return;
      const target = getTargetElement(source) || source;
      if (isReliableDomTarget(target)) return;
      const sourceRect = originalGetBoundingClientRect.call(source);
      if (sourceRect.width <= 0 || sourceRect.height <= 0) return;
      const snapshot = {
        target,
        rect: cloneRect(sourceRect),
        expiresAt: performance.now() + 750,
      };
      activeVisualRectOverride = snapshot;
      clearOverrideSoon(snapshot);
    },
    true,
  );

  Element.prototype.getBoundingClientRect = function patchedGetBoundingClientRect() {
    if (
      activeVisualRectOverride &&
      activeVisualRectOverride.target === this &&
      performance.now() <= activeVisualRectOverride.expiresAt
    ) {
      return cloneRect(activeVisualRectOverride.rect);
    }
    return originalGetBoundingClientRect.call(this);
  };
})();
