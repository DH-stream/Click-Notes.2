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

test("URL completion uses the shared matcher and keeps manual fallback", () => {
  assert.match(contentScript, /const suggestedLinkMatch = deriveSafeUrlMatch/);
  assert.match(contentScript, /suggestedLinkMatch \? "urlMatch" : "manual"/);
  assert.match(contentScript, /!existing \? suggestedLinkMatch : ""/);
  assert.match(contentScript, /const matchesAdvanceUrl =/);
  assert.match(contentScript, /matchesAdvanceUrl\(window\.location\.href, step\.advance\.value\)/);
  assert.doesNotMatch(contentScript, /window\.location\.href\.includes\(step\.advance\.value\)/);
  assert.match(contentScript, /Continue anyway/);
});


test("playback validates weak resolved targets before using saved position", () => {
  assert.match(contentScript, /function isResolvedElementTrustworthy/);
  assert.match(contentScript, /genericSelectorClasses = new Set/);
  assert.match(contentScript, /"hide-sm"/);
  assert.match(contentScript, /selectorMatchCount\(selector\)/);
  assert.match(contentScript, /distance > allowedDistance/);
  assert.match(contentScript, /getFallbackRect\(step\)/);
});

test("builder session exposes simple continuous editing controls", () => {
  assert.match(contentScript, /showBuilderBar/);
  assert.match(contentScript, /Editing guide/);
  assert.match(contentScript, /Select the next target/);
  assert.match(contentScript, /Step saved\. Select the next target or click Done\./);
  assert.match(contentScript, /Step saved\. Continue to the next page\./);
  assert.match(contentScript, /URL matched\. Select the next target\./);
  assert.match(contentScript, /Guide editing finished\./);
  assert.match(contentStyle, /#click-guide-builder-bar/);
});
