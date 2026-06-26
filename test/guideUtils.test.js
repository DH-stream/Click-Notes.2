const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createGuide,
  createBuilderResumeSession,
  createStep,
  deriveSafeUrlMatch,
  matchesAdvanceUrl,
  normalizeGuide,
  normalizeGuideUrl,
  normalizeStep,
  prepareImportedGuide,
  shouldResumeBuilderSession,
  upsertGuideStep,
} = require("../guideUtils.js");

test("deriveSafeUrlMatch strips query params and hashes", () => {
  assert.equal(
    deriveSafeUrlMatch("https://example.com/dashboard?token=abc#x"),
    "/dashboard",
  );
  assert.equal(
    deriveSafeUrlMatch("/checkout/confirm?session=abc", "https://example.com/cart"),
    "/checkout/confirm",
  );
});

test("deriveSafeUrlMatch rejects unsafe protocols", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "blob:https://example.com/id",
    "chrome://extensions",
    "chrome-extension://abc/page.html",
  ]) {
    assert.equal(deriveSafeUrlMatch(value), "");
  }
});

test("deriveSafeUrlMatch accepts safe path-only values", () => {
  assert.equal(deriveSafeUrlMatch("/dashboard"), "/dashboard");
  assert.equal(deriveSafeUrlMatch("/dashboard?token=secret#panel"), "/dashboard");
});

test("matchesAdvanceUrl matches normalized full URLs and paths", () => {
  const current = "https://example.com/dashboard?token=secret#panel";

  assert.equal(matchesAdvanceUrl(current, "https://example.com/dashboard"), true);
  assert.equal(matchesAdvanceUrl(current, "/dashboard"), true);
  assert.equal(matchesAdvanceUrl(current, "dashboard"), true);
  assert.equal(matchesAdvanceUrl(current, "/dash"), false);
  assert.equal(matchesAdvanceUrl(current, "javascript:alert(1)"), false);
});

test("normalizeGuideUrl strips query params and hashes", () => {
  assert.equal(
    normalizeGuideUrl("https://example.com/booking?session=abc123#step"),
    "https://example.com/booking",
  );
  assert.equal(normalizeGuideUrl("javascript:alert(1)"), "");
  assert.equal(normalizeGuideUrl("/relative/path?secret=1"), "");
});

test("createGuide stores normalized start URL and empty steps", () => {
  const guide = createGuide(" Ferry booking ", "https://example.com/path?token=secret#x");

  assert.equal(guide.title, "Ferry booking");
  assert.equal(guide.startUrl, "https://example.com/path");
  assert.equal(guide.version, 1);
  assert.equal(guide.schemaVersion, 1);
  assert.deepEqual(guide.steps, []);
  assert.match(guide.id, /^guide-/);
});

test("prepareImportedGuide accepts a guide and replaces conflicting ids", () => {
  const step = createStep({
    selector: "[data-guide-id=\"start\"]",
    fallbackText: "Start",
    pageUrl: "https://example.com/a?secret=1",
    rect: { x: 1, y: 2, width: 30, height: 40, documentX: 1, documentY: 2 },
  });
  step.title = "Start";
  const imported = prepareImportedGuide(
    {
      id: "guide-existing",
      title: "Imported",
      startUrl: "https://example.com/a?secret=1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      version: 1,
      steps: [step],
    },
    ["guide-existing"],
  );

  assert.notEqual(imported.id, "guide-existing");
  assert.equal(imported.title, "Imported");
  assert.equal(imported.startUrl, "https://example.com/a");
  assert.equal(imported.schemaVersion, 1);
  assert.equal(imported.steps.length, 1);
  assert.equal(imported.steps[0].pageUrl, "https://example.com/a");
});

test("prepareImportedGuide rejects invalid guide JSON", () => {
  assert.throws(
    () => prepareImportedGuide({ title: "", startUrl: "", steps: "nope" }, []),
    /steps array/,
  );
});

test("prepareImportedGuide rejects a step without target or saved position", () => {
  assert.throws(
    () =>
      prepareImportedGuide(
        {
          title: "Broken",
          startUrl: "https://example.com",
          steps: [{ title: "No target", body: "" }],
        },
        [],
      ),
    /target or saved position/,
  );
});

test("prepareImportedGuide rejects unsafe start URLs", () => {
  assert.throws(
    () =>
      prepareImportedGuide(
        {
          title: "Unsafe",
          startUrl: "javascript:alert(1)",
          steps: [{ title: "Step", target: { selector: "#safe" } }],
        },
        [],
      ),
    /safe absolute URL/,
  );
});

test("prepareImportedGuide dedupes imported step ids", () => {
  const imported = prepareImportedGuide(
    {
      title: "Duplicate steps",
      startUrl: "https://example.com",
      steps: [
        {
          id: "step-duplicate",
          title: "One",
          target: { selector: "#one" },
        },
        {
          id: "step-duplicate",
          title: "Two",
          target: { selector: "#two" },
        },
      ],
    },
    [],
  );

  assert.equal(imported.steps[0].id, "step-duplicate");
  assert.notEqual(imported.steps[1].id, "step-duplicate");
});

test("normalizeStep preserves rect fallback shape and showInstructionText", () => {
  const normalized = normalizeStep(
    {
      title: "Visual card",
      pageUrl: "https://example.com/path?token=secret",
      target: {
        selector: "",
        anchorMode: "rect",
        rect: { x: 10, y: 20, width: 160, height: 90, documentX: 10, documentY: 420 },
      },
      playback: { showInstructionText: false },
    },
    0,
  );

  assert.equal(normalized.target.anchorMode, "rect");
  assert.equal(normalized.target.rect.documentY, 420);
  assert.equal(normalized.target.anchorPoint.documentY, 465);
  assert.equal(normalized.pageUrl, "https://example.com/path");
  assert.equal(normalized.playback.showInstructionText, false);
  assert.equal(normalized.playback.showPopup, false);
});

test("normalizeStep drops unsafe fallback tag names", () => {
  const normalized = normalizeStep(
    {
      title: "Unsafe tag",
      target: {
        selector: "#target",
        fallbackTagName: "button, body {",
      },
    },
    0,
  );

  assert.equal(normalized.target.fallbackTagName, "");
});

test("normalizeStep sanitizes imported fallback metadata", () => {
  const normalized = normalizeStep(
    {
      title: "Imported metadata",
      target: {
        selector: "#target",
        fallbackText: ` ${"Long text ".repeat(40)} `,
        fallbackAriaLabel: ` ${"Label ".repeat(40)} `,
        fallbackRole: "button".repeat(40),
        classList: ["safe-class", "bad class", "also_safe-2", "<script>"],
        placeholder: ` ${"Placeholder ".repeat(40)} `,
        name: ` ${"fieldName".repeat(40)} `,
        type: ` ${"password".repeat(20)} `,
        href: "javascript:alert(1)",
      },
    },
    0,
  );

  assert.equal(normalized.target.fallbackText.length, 160);
  assert.equal(normalized.target.fallbackAriaLabel.length, 160);
  assert.equal(normalized.target.fallbackRole.length, 80);
  assert.deepEqual(normalized.target.classList, ["safe-class", "also_safe-2"]);
  assert.equal(normalized.target.placeholder.length, 160);
  assert.equal(normalized.target.name.length, 120);
  assert.equal(normalized.target.type.length, 80);
  assert.equal(normalized.target.href, "");
  assert.equal("value" in normalized.target, false);
});

test("normalizeStep defaults unsafe playback placement and advance mode", () => {
  const normalized = normalizeStep(
    {
      title: "Unsafe controls",
      target: { selector: "#target" },
      playback: { popupPlacement: "center<script>" },
      advance: { mode: "waitForever", value: "#done", allowManualFallback: false },
    },
    0,
  );

  assert.equal(normalized.playback.popupPlacement, "auto");
  assert.equal(normalized.advance.mode, "manual");
  assert.equal(normalized.advance.value, "#done");
  assert.equal(normalized.advance.allowManualFallback, false);
});

test("normalizeStep limits imported selector fields", () => {
  const longSelector = `#${"target".repeat(120)}`;
  const normalized = normalizeStep(
    {
      title: "Large metadata",
      target: {
        selector: longSelector,
        fallbackPath: longSelector,
        id: "id".repeat(120),
      },
      advance: { mode: "elementVisible", value: longSelector },
    },
    0,
  );

  assert.equal(normalized.target.selector.length, 500);
  assert.equal(normalized.target.fallbackPath.length, 500);
  assert.equal(normalized.target.id.length, 160);
  assert.equal(normalized.advance.value.length, 500);
});

test("prepareImportedGuide limits imported display text", () => {
  const imported = prepareImportedGuide(
    {
      title: "Guide ".repeat(80),
      description: "Description ".repeat(80),
      startUrl: "https://example.com",
      steps: [
        {
          title: "Title ".repeat(80),
          body: "Body ".repeat(800),
          target: { selector: "#target" },
        },
      ],
    },
    [],
  );

  assert.equal(imported.title.length, 140);
  assert.equal(imported.description.length, 500);
  assert.equal(imported.steps[0].title.length, 140);
  assert.equal(imported.steps[0].body.length, 2000);
});

test("prepareImportedGuide replaces unsafe imported ids", () => {
  const imported = prepareImportedGuide(
    {
      id: "guide <script>",
      title: "Unsafe ids",
      startUrl: "https://example.com",
      steps: [
        {
          id: "step <script>",
          title: "Step",
          target: { selector: "#target" },
        },
      ],
    },
    [],
  );

  assert.match(imported.id, /^guide-/);
  assert.match(imported.steps[0].id, /^step-/);
});

test("normalizeGuide sanitizes existing local guides", () => {
  const normalized = normalizeGuide({
    id: "guide <script>",
    title: "Local ".repeat(80),
    startUrl: "https://example.com/path?token=secret#hash",
    steps: [
      {
        id: "step <script>",
        title: "Step",
        target: {
          selector: "#target",
          fallbackTagName: "button, body {",
          href: "javascript:alert(1)",
          value: "secret",
        },
      },
    ],
  });

  assert.match(normalized.id, /^guide-/);
  assert.equal(normalized.title.length, 140);
  assert.equal(normalized.startUrl, "https://example.com/path");
  assert.match(normalized.steps[0].id, /^step-/);
  assert.equal(normalized.steps[0].target.fallbackTagName, "");
  assert.equal(normalized.steps[0].target.href, "");
  assert.equal("value" in normalized.steps[0].target, false);
});

test("normalizeGuide dedupes existing local step ids", () => {
  const normalized = normalizeGuide({
    id: "guide-local",
    title: "Local duplicate steps",
    startUrl: "https://example.com",
    steps: [
      { id: "step-duplicate", title: "One", target: { selector: "#one" } },
      { id: "step-duplicate", title: "Two", target: { selector: "#two" } },
    ],
  });

  assert.equal(normalized.steps[0].id, "step-duplicate");
  assert.notEqual(normalized.steps[1].id, "step-duplicate");
});

test("upsertGuideStep appends a selected target with inline edit fields", () => {
  const guide = createGuide("Inline", "https://example.com");
  const target = {
    selector: "#start",
    selectorConfidence: "medium",
    pageUrl: "https://example.com/path?draft=1",
  };

  const updated = upsertGuideStep(guide, target, "", {
    title: " Click here ",
    body: " Then continue ",
    showInstructionText: false,
    highlightTarget: true,
    dimPage: false,
    autoScroll: true,
    popupPlacement: "left",
    advanceMode: "urlMatch",
    advanceValue: "/done",
  });

  assert.equal(updated.steps.length, 1);
  assert.match(updated.steps[0].id, /^step-/);
  assert.equal(updated.steps[0].title, "Click here");
  assert.equal(updated.steps[0].body, "Then continue");
  assert.equal(updated.steps[0].target.selector, "#start");
  assert.equal(updated.steps[0].pageUrl, "https://example.com/path");
  assert.equal(updated.steps[0].playback.showInstructionText, false);
  assert.equal(updated.steps[0].playback.showPopup, false);
  assert.equal(updated.steps[0].playback.dimPage, false);
  assert.equal(updated.steps[0].playback.popupPlacement, "left");
  assert.equal(updated.steps[0].advance.mode, "urlMatch");
  assert.equal(updated.steps[0].advance.value, "/done");
});

test("upsertGuideStep retargets an existing step without changing its id", () => {
  const guide = createGuide("Inline", "https://example.com");
  const original = createStep({ selector: "#old", pageUrl: "https://example.com/old" });
  original.id = "step-existing";
  original.title = "Original title";
  guide.steps.push(original);

  const updated = upsertGuideStep(
    guide,
    { selector: "#new", selectorConfidence: "strong", pageUrl: "https://example.com/new" },
    "step-existing",
    { title: "Updated", body: "Retargeted" },
  );

  assert.equal(updated.steps.length, 1);
  assert.equal(updated.steps[0].id, "step-existing");
  assert.equal(updated.steps[0].title, "Updated");
  assert.equal(updated.steps[0].body, "Retargeted");
  assert.equal(updated.steps[0].target.selector, "#new");
  assert.equal(updated.steps[0].pageUrl, "https://example.com/new");
});

test("upsertGuideStep auto-configures URL matching for a safe link target", () => {
  const guide = createGuide("Links", "https://example.com/start");
  const target = {
    selector: "#dashboard-link",
    href: "https://example.com/dashboard?token=secret#overview",
    pageUrl: "https://example.com/start",
  };

  const updated = upsertGuideStep(guide, target, "", { title: "Open dashboard" });

  assert.equal(updated.steps[0].advance.mode, "urlMatch");
  assert.equal(updated.steps[0].advance.value, "/dashboard");
  assert.equal(updated.steps[0].advance.allowManualFallback, true);
});

test("upsertGuideStep keeps manual completion when no safe link exists", () => {
  const guide = createGuide("Buttons", "https://example.com/start");

  const updated = upsertGuideStep(
    guide,
    { selector: "#save", pageUrl: "https://example.com/start" },
    "",
    { title: "Save" },
  );

  assert.equal(updated.steps[0].advance.mode, "manual");
  assert.equal(updated.steps[0].advance.value, "");
});

test("upsertGuideStep preserves an explicitly manual safe link", () => {
  const guide = createGuide("Links", "https://example.com/start");

  const updated = upsertGuideStep(
    guide,
    {
      selector: "#dashboard-link",
      href: "https://example.com/dashboard?token=secret",
      pageUrl: "https://example.com/start",
    },
    "",
    { title: "Open dashboard", advanceMode: "manual" },
  );

  assert.equal(updated.steps[0].advance.mode, "manual");
  assert.equal(updated.steps[0].advance.value, "");
});

test("createBuilderResumeSession stores URL-match builder continuation", () => {
  const session = createBuilderResumeSession("guide-local", {
    advanceMode: "urlMatch",
    advanceValue: "checkout/confirm",
    tabId: 12,
  });

  assert.equal(session.guideId, "guide-local");
  assert.equal(session.waitForUrl, "checkout/confirm");
  assert.equal(session.tabId, 12);
  assert.match(session.createdAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("createBuilderResumeSession stores only a safe URL-match value", () => {
  const session = createBuilderResumeSession("guide-local", {
    advanceMode: "urlMatch",
    advanceValue: "https://example.com/checkout/confirm?session=secret#done",
  });

  assert.equal(session.waitForUrl, "/checkout/confirm");
  assert.equal(
    createBuilderResumeSession("guide-local", {
      advanceMode: "urlMatch",
      advanceValue: "javascript:alert(1)",
    }),
    null,
  );
});

test("createBuilderResumeSession ignores non URL-match steps", () => {
  assert.equal(
    createBuilderResumeSession("guide-local", {
      advanceMode: "manual",
      advanceValue: "checkout/confirm",
    }),
    null,
  );
  assert.equal(
    createBuilderResumeSession("guide-local", {
      advanceMode: "urlMatch",
      advanceValue: " ",
    }),
    null,
  );
});

test("shouldResumeBuilderSession matches the current URL", () => {
  const session = {
    guideId: "guide-local",
    waitForUrl: "checkout/confirm",
  };

  assert.equal(shouldResumeBuilderSession(session, "https://example.com/checkout/confirm"), true);
  assert.equal(shouldResumeBuilderSession(session, "https://example.com/cart"), false);
  assert.equal(shouldResumeBuilderSession(null, "https://example.com/checkout/confirm"), false);
});
