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

async function sendToActiveTab(type, payload = {}) {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error("No active tab found");
  return chrome.tabs.sendMessage(tab.id, { type, ...payload });
}

function formatNoteBlock(note, index) {
  const lines = [
    `### Note ${index + 1}`,
    "",
    "Element:",
    `- Tag: ${note.tagName || "n/a"}`,
    `- Selector: ${note.selector || "n/a"}`,
    `- Text: ${note.text || ""}`,
    `- Position: x=${note.rect?.x ?? "?"} y=${note.rect?.y ?? "?"} w=${note.rect?.width ?? "?"} h=${note.rect?.height ?? "?"}`,
    "",
    "Comment:",
    note.comment,
    ""
  ];

  const attrs = [];
  ["dataNote", "dataComponent", "dataTestid", "dataCy", "id"].forEach((key) => {
    if (note[key]) attrs.push(`- ${key}: ${note[key]}`);
  });
  if (attrs.length) {
    lines.splice(8, 0, "Metadata:", ...attrs, "");
  }

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
    setStatus("Open a localhost or Vercel page");
  }
}

toggleCaptureBtn.addEventListener("click", async () => {
  try {
    const result = await sendToActiveTab("CLICK_NOTES_TOGGLE_CAPTURE");
    toggleCaptureBtn.textContent = result.captureEnabled ? "Stop capture" : "Start capture";
    setStatus(result.captureEnabled ? "Capture enabled" : "Capture stopped");
  } catch {
    setStatus("Could not toggle capture here");
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
