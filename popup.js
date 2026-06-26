const app = document.getElementById("app");
const statusEl = document.getElementById("status");
const importFile = document.getElementById("importFile");
const panel = document.getElementById("panel");
const {
  createGuide,
  createStep,
  normalizeGuide,
  normalizeGuideUrl,
  normalizeStep,
  prepareImportedGuide,
} = window.ClickGuideUtils;

let state = {
  guides: [],
  view: "list",
  activeGuideId: "",
  editingStepId: "",
  pendingTarget: null,
};

function setStatus(message) {
  statusEl.textContent = message || "";
}

function el(tag, props = {}, children = []) {
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

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function isContentScriptLoaded(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "CLICK_GUIDE_PING" });
    return Boolean(response?.loaded);
  } catch {
    return false;
  }
}

async function ensureInjected(tabId) {
  if (await isContentScriptLoaded(tabId)) return;
  await chrome.scripting.insertCSS({ target: { tabId }, files: ["contentStyle.css"] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ["guideUtils.js", "contentScript.js"] });
}

async function loadGuides() {
  const { guides } = await chrome.storage.local.get({ guides: [] });
  state.guides = Array.isArray(guides) ? guides.map(normalizeGuide) : [];
  await saveGuides();
}

async function saveGuides() {
  await chrome.storage.local.set({ guides: state.guides });
}

function activeGuide() {
  return state.guides.find((guide) => guide.id === state.activeGuideId);
}

function activeStep() {
  const guide = activeGuide();
  return guide?.steps.find((step) => step.id === state.editingStepId);
}

function updateGuide(guide) {
  guide.updatedAt = new Date().toISOString();
  guide.steps = guide.steps.map(normalizeStep);
  state.guides = state.guides.map((item) => (item.id === guide.id ? guide : item));
}

function safeGuideUrl(value) {
  const normalized = normalizeGuideUrl(value || "");
  return normalized || "";
}

function button(label, onClick, className = "") {
  return el("button", { type: "button", className, textContent: label, onClick });
}

function render() {
  app.innerHTML = "";
  if (state.view === "editor") renderEditor();
  else if (state.view === "step") renderStepEditor();
  else renderList();
}

function renderList() {
  const toolbar = el("div", { className: "toolbar" }, [
    button("Create guide", createGuideFromTab, "primary"),
    button("Import guide", () => importFile.click()),
  ]);
  app.append(toolbar);
  app.append(el("div", {
    className: "drop-zone",
    textContent: "Drop a .clickguide file here to start playback",
  }));

  if (!state.guides.length) {
    app.append(el("div", { className: "list-empty", textContent: "No guides yet" }));
    return;
  }

  app.append(el("div", { className: "section" }, [
    el("h1", { textContent: "My guides" }),
  ]));

  state.guides.forEach((guide) => {
    const row = el("div", { className: "guide-row" }, [
      el("div", { className: "row-title", textContent: guide.title }),
      el("div", { className: "muted", textContent: `${guide.steps.length} steps - ${guide.startUrl}` }),
      el("div", { className: "row-actions" }, [
        button("Play", () => playGuide(guide.id), "small primary"),
        button("Edit", () => {
          state.activeGuideId = guide.id;
          state.view = "editor";
          render();
        }, "small"),
        button("Export", () => exportGuide(guide.id), "small"),
        button("Delete", () => deleteGuide(guide.id), "small danger"),
      ]),
    ]);
    app.append(row);
  });
}

function renderEditor() {
  const guide = activeGuide();
  if (!guide) {
    state.view = "list";
    render();
    return;
  }
  app.append(el("div", { className: "toolbar" }, [
    button("Back", () => {
      state.view = "list";
      render();
    }, "ghost"),
    button("Add step", () => selectStepTarget(guide.id), "primary"),
    button("Play", () => playGuide(guide.id)),
    button("Export", () => exportGuide(guide.id)),
  ]));
  app.append(el("div", { className: "section" }, [
    el("h1", { textContent: guide.title }),
    el("div", { className: "muted", textContent: guide.startUrl }),
  ]));
  if (!guide.steps.length) {
    app.append(el("div", { className: "list-empty", textContent: "No steps yet" }));
    return;
  }
  guide.steps.forEach((step, index) => {
    app.append(el("div", { className: "step-row" }, [
      el("div", { className: "row-title", textContent: `${index + 1}. ${step.title || "Untitled step"}` }),
      el("div", { className: "muted", textContent: step.target?.selector || "No selector" }),
      el("div", { className: "row-actions" }, [
        button("Edit", () => {
          state.editingStepId = step.id;
          state.pendingTarget = null;
          state.view = "step";
          render();
        }, "small"),
        button("Retarget", () => selectStepTarget(guide.id, step.id), "small"),
        button("Up", () => moveStep(guide.id, step.id, -1), "small"),
        button("Down", () => moveStep(guide.id, step.id, 1), "small"),
        button("Delete", () => deleteStep(guide.id, step.id), "small danger"),
      ]),
    ]));
  });
}

function field(labelText, input) {
  return el("div", {}, [
    el("label", { textContent: labelText }),
    input,
  ]);
}

function checkbox(id, labelText, checked) {
  const input = el("input", { id, type: "checkbox" });
  input.checked = checked;
  return el("label", { className: "check" }, [input, document.createTextNode(labelText)]);
}

function renderStepEditor() {
  const guide = activeGuide();
  const existing = activeStep();
  const step = existing || createStep(state.pendingTarget);
  const title = el("input", { id: "stepTitle", type: "text", placeholder: "Step title" });
  title.value = step.title || "";
  const body = el("textarea", { id: "stepBody", placeholder: "Instruction body" });
  body.value = step.body || "";
  const placement = el("select", { id: "popupPlacement" });
  ["auto", "top", "right", "bottom", "left"].forEach((value) => {
    const option = el("option", { value, textContent: value });
    option.selected = (step.playback?.popupPlacement || "auto") === value;
    placement.append(option);
  });
  const advanceMode = el("select", { id: "advanceMode" });
  ["manual", "urlMatch", "elementVisible"].forEach((value) => {
    const option = el("option", { value, textContent: value });
    option.selected = (step.advance?.mode || "manual") === value;
    advanceMode.append(option);
  });
  const advanceValue = el("input", { id: "advanceValue", type: "text", placeholder: "URL contains or selector" });
  advanceValue.value = step.advance?.value || "";

  const weakHint = step.target?.selectorConfidence === "weak"
    ? el("div", {
        className: "hint",
        textContent: `Weak selector. For a more reliable guide, add data-guide-id="..." or data-note="..." to this element.`,
      })
    : document.createTextNode("");

  app.append(el("div", { className: "toolbar" }, [
    button("Back", () => {
      state.view = "editor";
      state.pendingTarget = null;
      state.editingStepId = "";
      render();
    }, "ghost"),
    button("Save step", () => saveStepFromForm(step), "primary"),
  ]));
  app.append(el("div", { className: "section" }, [
    el("h1", { textContent: guide?.title || "Guide" }),
    el("div", { className: "muted", textContent: step.target?.selector || "No target selected" }),
    weakHint,
    field("Title", title),
    field("Body / instruction", body),
    checkbox(
      "showInstructionText",
      "Show instruction text",
      (step.playback?.showInstructionText ?? step.playback?.showPopup) !== false,
    ),
    checkbox("highlightTarget", "Highlight target", step.playback?.highlightTarget !== false),
    checkbox("autoScroll", "Scroll automatically to element", step.playback?.autoScroll !== false),
    checkbox("dimPage", "Dim rest of page", step.playback?.dimPage !== false),
    field("Popup placement", placement),
    field("Advance", advanceMode),
    field("Advance value", advanceValue),
  ]));
}

async function createGuideFromTab() {
  const tab = await getActiveTab();
  const title = prompt("Guide title", tab?.title || "Untitled guide");
  if (title === null) return;
  const guide = createGuide(title, tab?.url || "");
  state.guides.unshift(guide);
  state.activeGuideId = guide.id;
  state.view = "editor";
  await saveGuides();
  setStatus("Guide created");
  render();
}

async function deleteGuide(guideId) {
  if (!confirm("Delete this guide?")) return;
  state.guides = state.guides.filter((guide) => guide.id !== guideId);
  const { pendingGuideEdit, activeBuilderSession } = await chrome.storage.local.get({
    pendingGuideEdit: null,
    activeBuilderSession: null,
  });
  if (pendingGuideEdit?.guideId === guideId || activeBuilderSession?.guideId === guideId) {
    await chrome.storage.local.remove([
      "pendingGuideEdit",
      "selectedGuideTarget",
      "activeBuilderSession",
    ]);
  }
  await saveGuides();
  setStatus("Guide deleted");
  render();
}

async function selectStepTarget(guideId, stepId = "") {
  const tab = await getActiveTab();
  if (!tab?.id) return setStatus("No active tab");
  await ensureInjected(tab.id);
  await chrome.storage.local.set({ pendingGuideEdit: { guideId, stepId, tabId: tab.id } });
  await chrome.tabs.sendMessage(tab.id, { type: "CLICK_GUIDE_SELECT_STEP_TARGET" });
  window.close();
}

async function playGuide(guideId) {
  const guide = state.guides.find((item) => item.id === guideId);
  if (!guide) return;
  let tab = await getActiveTab();
  if (!tab?.id) return;
  const safeFirstPageUrl = safeGuideUrl(guide.startUrl);
  if (!safeFirstPageUrl) return setStatus("Guide has no safe start URL");
  if (normalizeGuideUrl(tab.url || "") !== safeFirstPageUrl) {
    await chrome.tabs.update(tab.id, { url: safeFirstPageUrl });
    await waitForTabComplete(tab.id);
    tab = await getActiveTab();
  }
  await ensureInjected(tab.id);
  await chrome.tabs.sendMessage(tab.id, {
    type: "CLICK_GUIDE_START_PLAYBACK",
    guide,
    stepIndex: 0,
    tabId: tab.id,
  });
  window.close();
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 5000);
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function exportGuide(guideId) {
  const guide = state.guides.find((item) => item.id === guideId);
  if (!guide) return;
  const exportableGuide = { ...guide, schemaVersion: guide.schemaVersion || 1 };
  const blob = new Blob([JSON.stringify(exportableGuide, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${guide.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "guide"}.clickguide`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus("Guide exported");
}

async function handleImport(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const imported = prepareImportedGuide(text, state.guides.map((guide) => guide.id));
    state.guides.unshift(imported);
    await saveGuides();
    setStatus("Guide imported");
    render();
    await playGuide(imported.id);
  } catch (error) {
    setStatus(error?.message || "Import failed");
  } finally {
    importFile.value = "";
  }
}

async function moveStep(guideId, stepId, direction) {
  const guide = state.guides.find((item) => item.id === guideId);
  if (!guide) return;
  const index = guide.steps.findIndex((step) => step.id === stepId);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= guide.steps.length) return;
  const [step] = guide.steps.splice(index, 1);
  guide.steps.splice(next, 0, step);
  updateGuide(guide);
  await saveGuides();
  render();
}

async function deleteStep(guideId, stepId) {
  const guide = state.guides.find((item) => item.id === guideId);
  if (!guide) return;
  guide.steps = guide.steps.filter((step) => step.id !== stepId);
  updateGuide(guide);
  await saveGuides();
  render();
}

async function saveStepFromForm(step) {
  const guide = activeGuide();
  if (!guide) return;
  const showInstructionText = document.getElementById("showInstructionText").checked;
  const saved = {
    ...step,
    title: document.getElementById("stepTitle").value.trim() || "Untitled step",
    body: document.getElementById("stepBody").value.trim(),
    playback: {
      showInstructionText,
      showPopup: showInstructionText,
      highlightTarget: document.getElementById("highlightTarget").checked,
      dimPage: document.getElementById("dimPage").checked,
      autoScroll: document.getElementById("autoScroll").checked,
      popupPlacement: document.getElementById("popupPlacement").value,
    },
    advance: {
      mode: document.getElementById("advanceMode").value,
      value: document.getElementById("advanceValue").value.trim(),
      allowManualFallback: true,
    },
  };
  const existingIndex = guide.steps.findIndex((item) => item.id === saved.id);
  if (existingIndex >= 0) guide.steps[existingIndex] = saved;
  else guide.steps.push(saved);
  updateGuide(guide);
  await saveGuides();
  state.view = "editor";
  state.pendingTarget = null;
  state.editingStepId = "";
  setStatus("Step saved");
  render();
}

async function consumePendingSelection() {
  const { pendingGuideEdit, selectedGuideTarget } = await chrome.storage.local.get({
    pendingGuideEdit: null,
    selectedGuideTarget: null,
  });
  if (!pendingGuideEdit) {
    if (selectedGuideTarget) await chrome.storage.local.remove("selectedGuideTarget");
    return;
  }
  const guide = state.guides.find((item) => item.id === pendingGuideEdit.guideId);
  if (!guide) {
    await chrome.storage.local.remove(["pendingGuideEdit", "selectedGuideTarget"]);
    return;
  }
  if (pendingGuideEdit.stepId && !guide.steps.some((step) => step.id === pendingGuideEdit.stepId)) {
    await chrome.storage.local.remove(["pendingGuideEdit", "selectedGuideTarget"]);
    state.activeGuideId = guide.id;
    state.view = "editor";
    setStatus("Step no longer exists");
    return;
  }
  if (!selectedGuideTarget) return;
  await chrome.storage.local.remove(["pendingGuideEdit", "selectedGuideTarget"]);
  state.activeGuideId = guide.id;
  const existing = guide.steps.find((step) => step.id === pendingGuideEdit.stepId);
  if (existing) {
    existing.target = selectedGuideTarget;
    existing.pageUrl = selectedGuideTarget.pageUrl || existing.pageUrl;
    state.editingStepId = existing.id;
    updateGuide(guide);
    await saveGuides();
  } else {
    if (pendingGuideEdit.stepId) {
      state.view = "editor";
      setStatus("Step no longer exists");
      return;
    }
    const step = createStep(selectedGuideTarget);
    state.pendingTarget = step.target;
    state.editingStepId = step.id;
  }
  state.view = "step";
}

importFile.addEventListener("change", () => handleImport(importFile.files?.[0]));

["dragenter", "dragover"].forEach((eventName) => {
  document.addEventListener(eventName, (event) => {
    event.preventDefault();
    panel?.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  document.addEventListener(eventName, (event) => {
    event.preventDefault();
    panel?.classList.remove("drag-over");
  });
});

document.addEventListener("drop", (event) => {
  const file = Array.from(event.dataTransfer?.files || []).find((item) =>
    item.name.toLowerCase().endsWith(".clickguide") ||
    item.name.toLowerCase().endsWith(".json"),
  );
  handleImport(file);
});

(async function init() {
  try {
    await loadGuides();
    await consumePendingSelection();
    render();
  } catch {
    setStatus("Could not load guides");
  }
})();
