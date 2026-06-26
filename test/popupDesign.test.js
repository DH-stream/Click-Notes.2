const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const contentScript = fs.readFileSync(path.join(root, "contentScript.js"), "utf8");
const contentStyle = fs.readFileSync(path.join(root, "contentStyle.css"), "utf8");

test("playback popup uses the compact step card structure", () => {
  assert.match(contentScript, /click-guide-card-body/);
  assert.match(contentScript, /click-guide-footer/);
  assert.match(contentScript, /click-guide-back-icon/);
  assert.match(contentScript, /Continue\s+→/);
});

test("playback popup styles match the reference card", () => {
  assert.match(contentStyle, /#click-guide-popup\s*\{[\s\S]*width: min\(320px, calc\(100vw - 24px\)\)/);
  assert.doesNotMatch(contentStyle, /#click-guide-popup \.click-guide-close\s*\{[\s\S]*border: 2px dashed #79a7ff/);
  assert.match(contentStyle, /#click-guide-popup \.click-guide-close\s*\{[\s\S]*border: 0 !important/);
  assert.match(contentStyle, /\.click-guide-card-body\s*\{[\s\S]*padding: 22px 16px 24px/);
  assert.match(contentStyle, /\.click-guide-count\s*\{[\s\S]*color: #00488d/);
  assert.match(contentStyle, /\.click-guide-footer\s*\{[\s\S]*border-top: 1px solid #e5e7eb/);
  assert.match(contentStyle, /#click-guide-popup \[data-action="next"\]\s*\{[\s\S]*border-radius: 0/);
});
