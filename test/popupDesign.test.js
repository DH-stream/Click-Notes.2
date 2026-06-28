const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const contentScript = fs.readFileSync(path.join(root, "contentScript.js"), "utf8");
const contentStyle = fs.readFileSync(path.join(root, "contentStyle.css"), "utf8");
const background = fs.readFileSync(path.join(root, "background.js"), "utf8");

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


test("playback repositions overlays without autoscroll on scroll", () => {
  assert.match(contentScript, /async function renderPlaybackStep\(\{ autoScroll = true, waitForTarget = false \} = \{\}\)/);
  assert.match(contentScript, /renderPlaybackStep\(\{ autoScroll: false \}\)/);
  assert.match(contentScript, /function getResolvedTargetRect/);
  assert.match(contentScript, /positionDimLayer\(layer, rect, resolvedTarget\.rectFallback\)/);
  assert.match(contentScript, /function enableOverlayPositionListeners/);
  assert.match(contentScript, /function disableOverlayPositionListeners/);
  assert.match(contentScript, /removeEventListener\("scroll", onOverlayPositionChange/);
});

test("playback waits for navigation targets and scroll settling", () => {
  assert.match(contentScript, /resolvePlaybackTargetWithRetry/);
  assert.match(contentScript, /waitForScrollSettle/);
  assert.match(contentScript, /prefersReducedMotion/);
  assert.match(contentScript, /behavior: prefersReducedMotion\(\) \? "auto" : "smooth"/);
});

test("persisted playback resumes only in its owning tab and clears when that tab closes", () => {
  assert.match(contentScript, /CLICK_GUIDE_GET_CURRENT_TAB_ID/);
  assert.match(contentScript, /currentTabId !== stored\.tabId/);
  assert.match(background, /sender\.tab\?\.id/);
  assert.match(background, /chrome\.tabs\.onRemoved\.addListener/);
});

test("final playback step only completes through an explicit action", () => {
  assert.match(contentScript, /const isLastStep = stepIndex >= guide\.steps\.length - 1/);
  assert.match(contentScript, /if \(!isLastStep\) watchAdvanceMode\(step\)/);
  assert.match(contentScript, /event\.target\?\.closest\("\[data-action\]"\)/);
  assert.match(contentScript, /clearAdvanceWatcher\(\)/);
});

test("exact and saved-position highlights have distinct polished styles", () => {
  assert.match(contentScript, /click-guide-target-highlight-saved/);
  assert.match(contentStyle, /\.click-guide-target-highlight-saved\s*\{/);
  assert.match(contentStyle, /@media \(prefers-reduced-motion: reduce\)/);
});

test("playback highlights use one clean edge with a diffuse halo", () => {
  const exactRule = contentStyle.match(/\.click-guide-target-highlight\s*\{([^}]*)\}/)?.[1] || "";
  const savedRule = contentStyle.match(/\.click-guide-target-highlight-saved\s*\{([^}]*)\}/)?.[1] || "";

  assert.match(exactRule, /border: 2px solid/);
  assert.match(exactRule, /box-shadow: 0 0 28px 6px/);
  assert.doesNotMatch(exactRule, /inset|0 0 0 \d+px/);
  assert.match(savedRule, /box-shadow: 0 0 26px 6px/);
  assert.doesNotMatch(savedRule, /inset|dashed|0 0 0 \d+px/);
});

test("builder editing shows non-blocking numbered saved-step pins", () => {
  assert.match(contentScript, /function renderBuilderStepPins/);
  assert.match(contentScript, /normalizeGuideUrl\(step\?\.pageUrl \|\| step\?\.target\?\.pageUrl \|\| ""\)/);
  assert.match(contentScript, /resolvePlaybackTarget\(step\)/);
  assert.match(contentScript, /pin\.textContent = String\(step\.order \|\| index \+ 1\)/);
  assert.match(contentScript, /clearBuilderStepPins\(\)/);
  assert.match(contentStyle, /\.click-guide-step-pin\s*\{/);
  assert.match(contentStyle, /pointer-events: none/);
});
