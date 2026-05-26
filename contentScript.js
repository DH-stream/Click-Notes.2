(() => {
  if (window.__CLICK_NOTES_LOADED__) return;
  window.__CLICK_NOTES_LOADED__ = true;

  let captureEnabled = false;
  let hoveredElement = null;
  let selectedElement = null;
  let modalOpen = false;
  let pinLayer = null;
  let overlaySyncRaf = null;

  function escapeCssValue(value) {
    if (!value) return "";
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
    return value.replace(/(["\\#.:\[\]\s>+~])/g, "\\$1");
  }

  function isLikelyGeneratedClassName(className) {
    return /^click-notes-/.test(className) || /^css-/.test(className) || /^r-/.test(className);
  }

  function getStableClass(element) {
    const classes = Array.from(element.classList || []);
    return classes.find((cls) => cls.length >= 3 && /^[a-zA-Z0-9_-]+$/.test(cls) && !/^\d/.test(cls) && !isLikelyGeneratedClassName(cls)) || "";
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
      const sameTag = Array.from(parent.children).filter((n) => n.tagName === current.tagName);
      const index = Math.max(1, sameTag.indexOf(current) + 1);
      segments.unshift(`${tag}:nth-of-type(${index})`);
      current = parent;
      depth += 1;
    }
    return segments.join(" > ");
  }

  function getElementSelector(element) {
    const dataPriority = ["note", "component", "testid", "cy"];
    for (const key of dataPriority) {
      const value = element.dataset?.[key];
      if (value) return `[data-${key}="${escapeCssValue(value)}"]`;
    }
    if (element.id) return `#${escapeCssValue(element.id)}`;
    const stableClass = getStableClass(element);
    if (stableClass) return `${element.tagName.toLowerCase()}.${escapeCssValue(stableClass)}`;
    return buildFallbackPath(element) || element.tagName.toLowerCase();
  }

  function getTargetElement(element) {
    const clickable = element.closest('button, a, [role="button"], input, label, textarea, select');
    return clickable || element;
  }

  function getTextSnippet(value, max = 180) {
    return (value || "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function getContextText(element, selector) {
    const parent = element.parentElement;
    const section = element.closest(selector);
    return getTextSnippet(section?.innerText || parent?.innerText || "", 220);
  }


  function getPageKey(url) {
    try {
      return new URL(url).origin + new URL(url).pathname;
    } catch {
      return url || "";
    }
  }

  function ensurePinLayer() {
    if (pinLayer && document.body.contains(pinLayer)) return pinLayer;
    pinLayer = document.createElement("div");
    pinLayer.id = "click-notes-overlay-layer";
    document.body.appendChild(pinLayer);
    return pinLayer;
  }

  function resolveNoteRect(note) {
    const targetId = note.targetId || "";
    if (targetId) {
      const target = document.querySelector(`[data-click-notes-target-id="${escapeCssValue(targetId)}"]`);
      if (target instanceof HTMLElement) {
        const rect = target.getBoundingClientRect();
        return {
          x: Math.round(rect.x + window.scrollX),
          y: Math.round(rect.y + window.scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      }
    }
    if (!note.rect) return null;
    return {
      x: typeof note.rect.documentX === "number" ? note.rect.documentX : Math.round((note.rect.x || 0) + window.scrollX),
      y: typeof note.rect.documentY === "number" ? note.rect.documentY : Math.round((note.rect.y || 0) + window.scrollY),
      width: Math.round(note.rect.width || 0),
      height: Math.round(note.rect.height || 0)
    };
  }

  async function renderPinsForCurrentPage() {
    const layer = ensurePinLayer();
    layer.innerHTML = "";
    const { notes } = await chrome.storage.local.get({ notes: [] });
    const pageKey = getPageKey(window.location.href);
    let pinNumber = 0;
    notes.forEach((note) => {
      if (getPageKey(note.url) !== pageKey) return;
      const rect = resolveNoteRect(note);
      if (!rect) return;
      pinNumber += 1;

      const overlay = document.createElement("div");
      overlay.className = "click-notes-target-overlay";
      overlay.style.left = `${rect.x}px`;
      overlay.style.top = `${rect.y}px`;
      overlay.style.width = `${Math.max(8, rect.width)}px`;
      overlay.style.height = `${Math.max(8, rect.height)}px`;

      const badge = document.createElement("div");
      badge.className = "click-notes-target-badge";
      badge.textContent = String(pinNumber);
      overlay.appendChild(badge);

      const pin = document.createElement("div");
      pin.className = "click-notes-pin";
      pin.textContent = String(pinNumber);
      pin.style.left = `${Math.max(8, rect.x - 10)}px`;
      pin.style.top = `${Math.max(8, rect.y - 10)}px`;

      layer.appendChild(overlay);
      layer.appendChild(pin);
    });
  }

  function scheduleOverlaySync() {
    if (overlaySyncRaf) return;
    overlaySyncRaf = requestAnimationFrame(() => {
      overlaySyncRaf = null;
      renderPinsForCurrentPage();
    });
  }

  function clearHighlight() {
    if (hoveredElement) hoveredElement.classList.remove("click-notes-highlight");
    hoveredElement = null;
  }

  function clearSelected() {
    selectedElement = null;
  }

  function showToast(message) {
    const existing = document.getElementById("click-notes-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "click-notes-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("visible"), 10);
    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 180);
    }, 1200);
  }

  function onMouseMove(event) {
    if (!captureEnabled || modalOpen) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.closest("#click-notes-modal")) return;
    const resolvedTarget = getTargetElement(target);
    if (hoveredElement !== resolvedTarget) {
      clearHighlight();
      hoveredElement = resolvedTarget;
      hoveredElement.classList.add("click-notes-highlight");
    }
  }

  function getModalPosition(x, y) {
    const margin = 12;
    const width = 280;
    const height = 220;
    let left = x + 10;
    let top = y + 10;
    if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
    if (top + height > window.innerHeight - margin) top = window.innerHeight - height - margin;
    return { left: Math.max(margin, left), top: Math.max(margin, top) };
  }

  function buildNotePayload(element, comment) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return {
      createdAt: new Date().toISOString(),
      url: window.location.href,
      pathname: window.location.pathname,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      tagName: element.tagName.toLowerCase(),
      text: getTextSnippet(element.innerText || element.textContent || ""),
      ariaLabel: element.getAttribute("aria-label") || "",
      titleAttr: element.getAttribute("title") || "",
      placeholder: element.getAttribute("placeholder") || "",
      role: element.getAttribute("role") || "",
      nameAttr: element.getAttribute("name") || "",
      typeAttr: element.getAttribute("type") || "",
      href: element.getAttribute("href") || "",
      src: element.getAttribute("src") || "",
      id: element.id || "",
      classList: Array.from(element.classList || []).filter((cls) => !isLikelyGeneratedClassName(cls)),
      selector: getElementSelector(element),
      fallbackPath: buildFallbackPath(element),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        documentX: Math.round(rect.x + window.scrollX),
        documentY: Math.round(rect.y + window.scrollY)
      },
      parentText: getContextText(element, "section, article, main, form, nav, aside"),
      sectionText: getContextText(element, "section, article, form, [role='region'], [data-testid]"),
      visual: {
        color: style.color,
        backgroundColor: style.backgroundColor,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow
      },
      comment,
      targetId: element.dataset.clickNotesTargetId || ""
    };
  }

  async function saveNote(note) {
    const { notes } = await chrome.storage.local.get({ notes: [] });
    notes.push(note);
    await chrome.storage.local.set({ notes });
    return notes.length;
  }

  function openNoteModal(target, clickX, clickY) {
    modalOpen = true;
    clearHighlight();
    clearSelected();
    selectedElement = target;

    const modal = document.createElement("div");
    modal.id = "click-notes-modal";
    const { left, top } = getModalPosition(clickX, clickY);
    modal.style.left = `${left}px`;
    modal.style.top = `${top}px`;

    const summary = `${target.tagName.toLowerCase()}: ${getTextSnippet(target.innerText || target.getAttribute("aria-label") || getElementSelector(target), 42)}`;
    modal.innerHTML = `
      <div class="target-summary">${summary}</div>
      <textarea id="click-notes-text" placeholder="Write a quick note..."></textarea>
      <div class="actions">
        <button id="click-notes-cancel" type="button">Cancel</button>
        <button id="click-notes-save" type="button">Save note</button>
      </div>
    `;

    document.body.appendChild(modal);
    const textarea = modal.querySelector("#click-notes-text");
    const cancelBtn = modal.querySelector("#click-notes-cancel");
    const saveBtn = modal.querySelector("#click-notes-save");
    textarea.focus();

    const closeModal = () => {
      modalOpen = false;
      clearSelected();
      modal.remove();
    };

    const saveCurrentNote = async () => {
      const comment = textarea.value;
      if (!comment.trim()) return textarea.focus();
      if (!target.dataset.clickNotesTargetId) target.dataset.clickNotesTargetId = `cn-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const note = buildNotePayload(target, comment);
      const count = await saveNote(note);
      await renderPinsForCurrentPage();
      closeModal();
      showToast(`${count} notes saved`);
    };

    cancelBtn.addEventListener("click", closeModal);
    saveBtn.addEventListener("click", saveCurrentNote);
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        saveCurrentNote();
      }
    });
  }

  function onClick(event) {
    if (!captureEnabled || modalOpen) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.closest("#click-notes-modal")) return;
    event.preventDefault();
    event.stopPropagation();
    const resolvedTarget = getTargetElement(target);
    openNoteModal(resolvedTarget, event.clientX, event.clientY);
  }

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("scroll", scheduleOverlaySync, { passive: true, capture: true });
  window.addEventListener("resize", scheduleOverlaySync);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "CLICK_NOTES_PING") {
      sendResponse({ loaded: true });
      return true;
    }
    if (message.type === "CLICK_NOTES_START_CAPTURE") {
      captureEnabled = true;
      renderPinsForCurrentPage();
      chrome.storage.local.get({ notes: [] }).then(({ notes }) => sendResponse({ captureEnabled, noteCount: notes.length }));
      return true;
    }
    if (message.type === "CLICK_NOTES_STOP_CAPTURE") {
      captureEnabled = false;
      if (!captureEnabled) {
        clearHighlight();
        clearSelected();
      }
      chrome.storage.local.get({ notes: [] }).then(({ notes }) => sendResponse({ captureEnabled, noteCount: notes.length }));
      return true;
    }
    if (message.type === "CLICK_NOTES_CLEAR_PINS") {
      const layer = ensurePinLayer();
      layer.innerHTML = "";
      sendResponse({ cleared: true });
      return true;
    }
    if (message.type === "CLICK_NOTES_GET_STATE") {
      chrome.storage.local.get({ notes: [] }).then(({ notes }) => sendResponse({ captureEnabled, noteCount: notes.length }));
      return true;
    }
    return false;
  });
})();
