const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createGuide,
  normalizeGuideUrl,
  prepareImportedGuide,
} = require("../guideUtils.js");

test("normalizeGuideUrl strips query params and hashes", () => {
  assert.equal(
    normalizeGuideUrl("https://example.com/booking?session=abc123#step"),
    "https://example.com/booking",
  );
});

test("createGuide stores normalized start URL and empty steps", () => {
  const guide = createGuide(" Ferry booking ", "https://example.com/path?token=secret#x");

  assert.equal(guide.title, "Ferry booking");
  assert.equal(guide.startUrl, "https://example.com/path");
  assert.equal(guide.version, 1);
  assert.deepEqual(guide.steps, []);
  assert.match(guide.id, /^guide-/);
});

test("prepareImportedGuide accepts a guide and replaces conflicting ids", () => {
  const imported = prepareImportedGuide(
    {
      id: "guide-existing",
      title: "Imported",
      startUrl: "https://example.com/a?secret=1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      version: 1,
      steps: [],
    },
    ["guide-existing"],
  );

  assert.notEqual(imported.id, "guide-existing");
  assert.equal(imported.title, "Imported");
  assert.equal(imported.startUrl, "https://example.com/a");
  assert.deepEqual(imported.steps, []);
});

test("prepareImportedGuide rejects invalid guide JSON", () => {
  assert.throws(
    () => prepareImportedGuide({ title: "", startUrl: "", steps: "nope" }, []),
    /Invalid guide/,
  );
});
