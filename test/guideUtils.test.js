const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createGuide,
  createStep,
  normalizeGuideUrl,
  normalizeStep,
  prepareImportedGuide,
} = require("../guideUtils.js");

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
