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
