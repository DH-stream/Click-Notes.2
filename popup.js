const recordBtn = document.getElementById("recordBtn");
const stopBtn = document.getElementById("stopBtn");
const copyBtn = document.getElementById("copyBtn");
const clearBtn = document.getElementById("clearBtn");
const notesList = document.getElementById("notesList");
const statusDot = document.getElementById("statusDot");
const headerLabel = document.getElementById("headerLabel");

function setRecordingUI(isRecording) {
  recordBtn.style.display = isRecording ? "none" : "block";
  stopBtn.style.display = isRecording ? "block" : "none";
  if (statusDot) statusDot.classList.toggle("recording", isRecording);
  if (headerLabel) headerLabel.textContent = isRecording ? "Recording…" : "Click Notes";
}

function setCopyLabel(noteCount) {
  copyBtn.textContent = noteCount > 0 ? `Copy ${noteCount}` : "Copy";
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function isContentScriptLoaded(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "CLICK_NOTES_PING" });
    return Boolean(response?.loaded);
  } catch {
    return false;
  }
}

async function ensureInjected(tabId) {
  const alreadyLoaded = await isContentScriptLoaded(tabId);
  if (alreadyLoaded) return;
  await chrome.scripting.insertCSS({ target: { tabId }, files: ["contentStyle.css"] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["contentScript.js"] });
}

async function sendToActiveTab(type) {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error("No active tab found");
  if (type === "CLICK_NOTES_START_CAPTURE") await ensureInjected(tab.id);
  return chrome.tabs.sendMessage(tab.id, { type });
}

function quoted(value) { return value ? `"${value}"` : "n/a"; }

function isLowValueClass(className) {
  return /^click-notes-/.test(className) || /^css-/.test(className) || /^r-/.test(className);
}

function cleanClassList(classList = []) {
  return classList.filter((cls) => !isLowValueClass(cls));
}

function renderNotePreviews(notes) {
  notesList.innerHTML = "";
  notes.forEach((note, idx) => {
    const row = document.createElement("div");
    row.className = "note-row";
    const text = (note.comment || "").trim();
    row.innerHTML = `<span class="num">${idx + 1}</span><span class="text">${text}</span>`;
    row.title = "Click to edit";
    row.style.cursor = "pointer";
    row.addEventListener("click", async () => {
      try {
        const tab = await getActiveTab();
        if (!tab?.id) return;
        await chrome.tabs.sendMessage(tab.id, { type: "CLICK_NOTES_EDIT_NOTE", noteIndex: idx });
        window.close(); // close popup so user can see the edit modal on the page
      } catch {}
    });
    notesList.appendChild(row);
  });
}

function formatImplementationClues(note) {
  const clues = [];
  if (note.text) clues.push(`- Search repo for visible text: ${quoted(note.text)}`);
  if (note.ariaLabel) clues.push(`- Search repo for aria-label: ${quoted(note.ariaLabel)}`);
  if (note.id) clues.push(`- Search repo for id: ${quoted(note.id)}`);
  const meaningfulClasses = cleanClassList(note.classList || []);
  if (meaningfulClasses.length) clues.push(`- Search repo for class names: ${meaningfulClasses.slice(0, 4).join(", ")}`);
  if (note.selector) clues.push(`- Search repo for selector: ${quoted(note.selector)}`);
  if (note.pathname) clues.push(`- Search route/page: ${note.pathname}`);
  return clues.length ? clues : ["- No strong implementation clues found"];
}

function formatNoteBlock(note, index) {
  return [
    `### Note ${index + 1}`,
    "", "Target:",
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
    `- Class list: ${cleanClassList(note.classList || []).join(" ") || "n/a"}`,
    `- Position: x=${note.rect?.x ?? "?"} y=${note.rect?.y ?? "?"} w=${note.rect?.width ?? "?"} h=${note.rect?.height ?? "?"}`,
    "", "Nearby context:",
    `- Parent text: ${note.parentText || "n/a"}`,
    `- Section text: ${note.sectionText || "n/a"}`,
    `- Route: ${note.pathname || "n/a"}`,
    "", "Visual clues:",
    `- Color: ${note.visual?.color || "n/a"}`,
    `- Background: ${note.visual?.backgroundColor || "n/a"}`,
    `- Font size: ${note.visual?.fontSize || "n/a"}`,
    `- Font weight: ${note.visual?.fontWeight || "n/a"}`,
    `- Border radius: ${note.visual?.borderRadius || "n/a"}`,
    `- Box shadow: ${note.visual?.boxShadow || "n/a"}`,
    "", "Implementation clues:", ...formatImplementationClues(note),
    "", "Comment:", note.comment, ""
  ].join("\n");
}

function buildMarkdown(notes) {
  const byPage = notes.reduce((acc, note) => ((acc[note.url || "unknown"] ||= []).push(note), acc), {});
  const lines = ["# Visual build notes", "", `Generated: ${new Date().toISOString()}`, ""];
  Object.entries(byPage).forEach(([url, pageNotes]) => {
    lines.push(`## Page: ${url}`, "", `Title: ${pageNotes[0].title || "Untitled"}`, `Viewport: ${pageNotes[0].viewport?.width || "?"}x${pageNotes[0].viewport?.height || "?"}`, "");
    pageNotes.forEach((note, idx) => lines.push(formatNoteBlock(note, idx)));
  });
  return lines.join("\n").trim();
}

async function flashButton(button, text, restoreText) {
  button.textContent = text;
  await new Promise((r) => setTimeout(r, 900));
  button.textContent = restoreText;
}

async function refresh() {
  const { notes } = await chrome.storage.local.get({ notes: [] });
  setCopyLabel(notes.length);
  renderNotePreviews(notes);
  try {
    const state = await sendToActiveTab("CLICK_NOTES_GET_STATE");
    setRecordingUI(Boolean(state?.captureEnabled));
  } catch {
    setRecordingUI(false);
  }
}

recordBtn.addEventListener("click", async () => {
  try {
    await sendToActiveTab("CLICK_NOTES_START_CAPTURE");
    await refresh();
  } catch {}
});

stopBtn.addEventListener("click", async () => {
  try {
    await sendToActiveTab("CLICK_NOTES_STOP_CAPTURE");
    await refresh();
  } catch {}
});

copyBtn.addEventListener("click", async () => {
  const { notes } = await chrome.storage.local.get({ notes: [] });
  if (!notes.length) return;
  try {
    await navigator.clipboard.writeText(buildMarkdown(notes));
    await flashButton(copyBtn, "Copied", notes.length > 0 ? `Copy ${notes.length}` : "Copy");
  } catch {}
});

clearBtn.addEventListener("click", async () => {
  await chrome.storage.local.set({ notes: [] });
  try {
    const tab = await getActiveTab();
    if (tab?.id) {
      await ensureInjected(tab.id);
      await chrome.tabs.sendMessage(tab.id, { type: "CLICK_NOTES_CLEAR_PINS" });
    }
  } catch {}
  await flashButton(clearBtn, "Cleared", "Clear");
  await refresh();
});

refresh();
