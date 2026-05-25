let captureEnabled = false;
let hoveredElement = null;
let modalOpen = false;

function escapeCssValue(value) {
  if (!value) return "";
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/(["\\#.:\[\]\s>+~])/g, "\\$1");
}

function getStableClass(element) {
  const classes = Array.from(element.classList || []);
  const ignoredPatterns = [/^\d/, /^(active|selected|open|close|hidden|visible)$/i, /^(sm|md|lg|xl|2xl)$/i];
  const candidate = classes.find((cls) => {
    if (cls.length < 3) return false;
    if (ignoredPatterns.some((pattern) => pattern.test(cls))) return false;
    return /^[a-zA-Z0-9_-]+$/.test(cls);
  });
  return candidate || "";
}

function buildFallbackPath(element) {
  const segments = [];
  let current = element;
  let depth = 0;

  while (current && current.nodeType === Node.ELEMENT_NODE && depth < 4) {
    const tag = current.tagName.toLowerCase();
    const id = current.id ? `#${escapeCssValue(current.id)}` : "";

    if (id) {
      segments.unshift(`${tag}${id}`);
      break;
    }

    const stableClass = getStableClass(current);
    if (stableClass) {
      segments.unshift(`${tag}.${escapeCssValue(stableClass)}`);
      break;
    }

    const parent = current.parentElement;
    if (!parent) {
      segments.unshift(tag);
      break;
    }

    const siblings = Array.from(parent.children).filter((node) => node.tagName === current.tagName);
    const index = siblings.indexOf(current) + 1;
    segments.unshift(`${tag}:nth-of-type(${index})`);

    current = parent;
    depth += 1;
  }

  return segments.join(" > ");
}

function getElementSelector(element) {
  if (!element) return "";

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

function clearHighlight() {
  if (hoveredElement) hoveredElement.classList.remove("click-notes-highlight");
  hoveredElement = null;
}

function showToast(message) {
  const existing = document.getElementById("click-notes-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "click-notes-toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("visible");
  }, 10);

  window.setTimeout(() => {
    toast.classList.remove("visible");
    window.setTimeout(() => toast.remove(), 180);
  }, 1200);
}

function onMouseMove(event) {
  if (!captureEnabled || modalOpen) return;

  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.closest("#click-notes-modal")) return;

  if (hoveredElement !== target) {
    clearHighlight();
    hoveredElement = target;
    hoveredElement.classList.add("click-notes-highlight");
  }
}

function getModalPosition(x, y) {
  const margin = 12;
  const width = 280;
  const height = 190;
  let left = x + 10;
  let top = y + 10;
  if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
  if (top + height > window.innerHeight - margin) top = window.innerHeight - height - margin;
  return { left: Math.max(margin, left), top: Math.max(margin, top) };
}

function buildNotePayload(element, comment) {
  const rect = element.getBoundingClientRect();
  return {
    createdAt: new Date().toISOString(),
    url: window.location.href,
    title: document.title,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    tagName: element.tagName.toLowerCase(),
    selector: getElementSelector(element),
    text: (element.innerText || "").trim().slice(0, 180),
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    },
    dataNote: element.getAttribute("data-note") || "",
    dataComponent: element.getAttribute("data-component") || "",
    dataTestid: element.getAttribute("data-testid") || "",
    dataCy: element.getAttribute("data-cy") || "",
    id: element.id || "",
    comment
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

  const modal = document.createElement("div");
  modal.id = "click-notes-modal";

  const { left, top } = getModalPosition(clickX, clickY);
  modal.style.left = `${left}px`;
  modal.style.top = `${top}px`;

  modal.innerHTML = `
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
    modal.remove();
  };

  const saveCurrentNote = async () => {
    const comment = textarea.value;
    if (!comment.trim()) {
      textarea.focus();
      return;
    }

    const note = buildNotePayload(target, comment);
    const count = await saveNote(note);
    closeModal();
    showToast(`${count} notes saved`);
  };

  cancelBtn.addEventListener("click", closeModal);
  saveBtn.addEventListener("click", saveCurrentNote);

  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
      return;
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
  if (!(target instanceof HTMLElement)) return;
  if (target.closest("#click-notes-modal")) return;

  event.preventDefault();
  event.stopPropagation();
  openNoteModal(target, event.clientX, event.clientY);
}

function setCaptureEnabled(value) {
  captureEnabled = value;
  if (!value) clearHighlight();
}

document.addEventListener("mousemove", onMouseMove, true);
document.addEventListener("click", onClick, true);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "CLICK_NOTES_TOGGLE_CAPTURE") {
    setCaptureEnabled(!captureEnabled);
    chrome.storage.local.get({ notes: [] }).then(({ notes }) => {
      sendResponse({ captureEnabled, noteCount: notes.length });
    });
    return true;
  }

  if (message.type === "CLICK_NOTES_GET_STATE") {
    chrome.storage.local.get({ notes: [] }).then(({ notes }) => {
      sendResponse({ captureEnabled, noteCount: notes.length });
    });
    return true;
  }

  return false;
});
