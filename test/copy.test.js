const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const contentScript = fs.readFileSync(path.join(root, "contentScript.js"), "utf8");
const popup = fs.readFileSync(path.join(root, "popup.js"), "utf8");

test("playback fallback and missing states use plain language", () => {
  assert.match(contentScript, /Target not found/);
  assert.match(contentScript, /This part of the page may have changed or not loaded yet\./);
  assert.match(contentScript, /The page changed, so this step is shown near the saved spot\./);
  assert.doesNotMatch(contentScript, /Element not found/);
  assert.doesNotMatch(contentScript, /Original element not found/);
});

test("selection and inline editing avoid element and selector jargon", () => {
  assert.match(contentScript, /Choose what this step should point to/);
  assert.match(contentScript, /Saved position fallback available/);
  assert.match(contentScript, /This target may move if the page changes/);
  assert.match(contentScript, /Click Guide will still try to show this step near the saved area/);
  assert.doesNotMatch(contentScript, /URL contains or selector/);
  assert.doesNotMatch(contentScript, /Element selected/);
  assert.doesNotMatch(contentScript, /Select an element/);
});

test("popup step editing uses human target and continuation labels", () => {
  assert.match(popup, /getTargetDisplayLabel/);
  assert.match(popup, /Choose again/);
  assert.match(popup, /Continue manually/);
  assert.match(popup, /After opening a page/);
  assert.match(popup, /When part of the page appears/);
  assert.match(popup, /Saved position fallback available/);
  assert.doesNotMatch(popup, /No selector/);
  assert.doesNotMatch(popup, /Weak selector/);
  assert.doesNotMatch(popup, /URL contains or selector/);
  assert.doesNotMatch(popup, /Scroll automatically to element/);
  assert.doesNotMatch(popup, /textContent: step\.target\?\.selector/);
});
