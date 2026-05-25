let captureEnabled = false;
let hoveredElement = null;
let modalOpen = false;

function getElementSelector(element) {
  if (!element) return "";

  const dataKeys = ["note", "component", "testid", "cy"];
  for (const key of dataKeys) {
    const value = element.dataset?.[key];
    if (value) return `[data-${key}="${value}"]`;
  }

  if (element.id) return `#${element.id}`;

  const className = (element.className || "").toString().trim();
  if (className && !className.includes(" ")) return `${element.tagName.toLowerCase()}.${className}`;

  return element.tagName.toLowerCase();
}

function clearHighlight() {
  if (hoveredElement) hoveredElement.classList.remove("click-notes-highlight");
  hoveredElement = null;
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

  cancelBtn.addEventListener("click", closeModal);
  saveBtn.addEventListener("click", async () => {
    const comment = textarea.value;
    if (!comment.trim()) {
      textarea.focus();
      return;
    }

    const note = buildNotePayload(target, comment);
    await saveNote(note);
    closeModal();
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
