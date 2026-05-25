const toggleCaptureBtn = document.getElementById("toggleCapture");
const copyNotesBtn = document.getElementById("copyNotes");
const clearNotesBtn = document.getElementById("clearNotes");
const statusEl = document.getElementById("status");

function setStatus(message) {
  statusEl.textContent = message;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureInjected(tabId) {
  await chrome.scripting.insertCSS({ target: { tabId }, files: ["contentStyle.css"] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["contentScript.js"] });
}

async function sendToActiveTab(type, payload = {}) {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error("No active tab found");

  if (type === "CLICK_NOTES_TOGGLE_CAPTURE") {
    await ensureInjected(tab.id);
  }

  return chrome.tabs.sendMessage(tab.id, { type, ...payload });
}

function quoted(value) {
  return value ? `"${value}"` : "n/a";
}

function formatImplementationClues(note) {
  const clues = [];
  if (note.text) clues.push(`- Search repo for visible text: ${quoted(note.text)}`);
  if (note.ariaLabel) clues.push(`- Search repo for aria-label: ${quoted(note.ariaLabel)}`);
  if (note.id) clues.push(`- Search repo for id: ${quoted(note.id)}`);
  if (Array.isArray(note.classList) && note.classList.length) clues.push(`- Search repo for class names: ${note.classList.slice(0, 4).join(", ")}`);
  if (note.selector) clues.push(`- Search repo for selector: ${quoted(note.selector)}`);
  if (note.pathname) clues.push(`- Search route/page: ${note.pathname}`);
  return clues.length ? clues : ["- No strong implementation clues found"]; 
}

function formatNoteBlock(note, index) {
  const lines = [
    `### Note ${index + 1}`,
    "",
    "Target:",
    `- Tag: ${note.tagName || "n/a"}`,
    `- Selector: ${note.selector || "n/a"}`,
    `- Fallback path: ${note.fallbackPath || "n/a"}`,
    `- Text: ${note.text || "n/a"}`,
    `- Role: ${note.role || "n/a"}`,
    `- Aria label: ${note.ariaLabel || "n/a"}`,
    `- Title attribute: ${note.titleAttr || "n/a"}`,
    `- Name: ${note.nameAttr || "n/a"}`,
    `- Type: ${note.typeAttr || "n/a"}`,
    `- Placeholder: ${note.placeholder || "n/a"}`,
    `- Href: ${note.href || "n/a"}`,
    `- Src: ${note.src || "n/a"}`,
    `- Id: ${note.id || "n/a"}`,
    `- Class list: ${(note.classList || []).join(" ") || "n/a"}`,
    `- Position: x=${note.rect?.x ?? "?"} y=${note.rect?.y ?? "?"} w=${note.rect?.width ?? "?"} h=${note.rect?.height ?? "?"}`,
    "",
    "Nearby context:",
    `- Parent text: ${note.parentText || "n/a"}`,
    `- Section text: ${note.sectionText || "n/a"}`,
    `- Route: ${note.pathname || "n/a"}`,
    "",
    "Visual clues:",
    `- Color: ${note.visual?.color || "n/a"}`,
    `- Background: ${note.visual?.backgroundColor || "n/a"}`,
    `- Font size: ${note.visual?.fontSize || "n/a"}`,
    `- Font weight: ${note.visual?.fontWeight || "n/a"}`,
    `- Border radius: ${note.visual?.borderRadius || "n/a"}`,
    `- Box shadow: ${note.visual?.boxShadow || "n/a"}`,
    "",
    "Implementation clues:",
    ...formatImplementationClues(note),
    "",
    "Comment:",
    note.comment,
    ""
  ];

  return lines.join("\n");
}

function buildMarkdown(notes) {
  const byPage = notes.reduce((acc, note) => {
    const key = note.url || "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(note);
    return acc;
  }, {});

  const lines = ["# Visual build notes", "", `Generated: ${new Date().toISOString()}`, ""];

  Object.entries(byPage).forEach(([url, pageNotes]) => {
    lines.push(`## Page: ${url}`);
    lines.push("");
    lines.push(`Title: ${pageNotes[0].title || "Untitled"}`);
    lines.push(`Viewport: ${pageNotes[0].viewport?.width || "?"}x${pageNotes[0].viewport?.height || "?"}`);
    lines.push("");
    pageNotes.forEach((note, idx) => lines.push(formatNoteBlock(note, idx)));
  });

  return lines.join("\n").trim();
}

async function refresh() {
  try {
    const state = await sendToActiveTab("CLICK_NOTES_GET_STATE");
    toggleCaptureBtn.textContent = state?.captureEnabled ? "Stop capture" : "Start capture";
    setStatus(`${state?.noteCount || 0} saved notes`);
  } catch {
    toggleCaptureBtn.textContent = "Start capture";
    const { notes } = await chrome.storage.local.get({ notes: [] });
    setStatus(`${notes.length} saved notes`);
  }
}

toggleCaptureBtn.addEventListener("click", async () => {
  try {
    const result = await sendToActiveTab("CLICK_NOTES_TOGGLE_CAPTURE");
    toggleCaptureBtn.textContent = result.captureEnabled ? "Stop capture" : "Start capture";
    setStatus(result.captureEnabled ? "Capture enabled" : "Capture stopped");
  } catch {
    setStatus("Could not start capture on this tab");
  }
});

copyNotesBtn.addEventListener("click", async () => {
  try {
    const { notes } = await chrome.storage.local.get({ notes: [] });
    if (!notes.length) {
      setStatus("No notes to copy");
      return;
    }
    const markdown = buildMarkdown(notes);
    await navigator.clipboard.writeText(markdown);
    setStatus(`Copied ${notes.length} notes`);
  } catch {
    setStatus("Copy failed");
  }
});

clearNotesBtn.addEventListener("click", async () => {
  await chrome.storage.local.set({ notes: [] });
  setStatus("Cleared notes");
  refresh();
});

refresh();
