import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { buildGuides, parseGuide, renderModule, slugify, toPlainText, OUTPUT_FILE } from "./build-help-content.mjs";

/**
 * The in-app help pages are generated from docs/user-guides/*.md. This is the check that
 * keeps the two honest: editing a guide and forgetting to run `npm run build:help` fails
 * the build here, rather than showing up later as a help page quoting documentation that
 * no longer says that.
 */
test("the committed help content matches docs/user-guides", () => {
  assert.equal(
    readFileSync(OUTPUT_FILE, "utf8"),
    renderModule(buildGuides()),
    "packages/core/src/help/generated/guides.ts is stale -- run `npm run build:help`",
  );
});

test("slugify drops a leading section number so anchors survive renumbering", () => {
  // The number is presentation. Anchoring to it would break every existing link the
  // moment a section is inserted above.
  assert.equal(slugify("3. Businesses and offerings"), "businesses-and-offerings");
  assert.equal(slugify("10. Environment variables (for operators)"), "environment-variables-for-operators");
  assert.equal(slugify("The `gst` module key"), "the-gst-module-key");
  assert.equal(slugify("e-Invoicing / e-Way Bill"), "e-invoicing-e-way-bill");
});

test("toPlainText strips the markup a summary has no use for", () => {
  assert.equal(toPlainText("A **bold** [link](/x) and `code`."), "A bold link and code.");
  assert.equal(toPlainText("Before\n```\ncode block\n```\nafter"), "Before after");
});

test("parseGuide splits a guide into linkable sections", () => {
  const guide = parseGuide(
    "05-finance.md",
    ["# Finance", "", "Finance is your books. More text.", "", "## Banking", "", "Import a statement.", "", "## Reports", "", "P&L."].join("\n"),
  );
  assert.equal(guide.slug, "finance");
  assert.equal(guide.order, 5);
  assert.equal(guide.title, "Finance");
  assert.equal(guide.summary, "Finance is your books.");
  assert.deepEqual(
    guide.sections.map((section) => [section.id, section.heading, section.body]),
    [
      ["banking", "Banking", "Import a statement."],
      ["reports", "Reports", "P&L."],
    ],
  );
});

test("parseGuide takes a summary from the first section when there is no intro", () => {
  const guide = parseGuide("00-getting-started.md", "# Getting Started\n\n## Step one\n\nGo to Sign up and do the thing.\n");
  assert.equal(guide.summary, "Go to Sign up and do the thing.");
});

// Two sections that slugify the same would silently steal each other's anchor -- one of
// them becomes permanently unlinkable, and nothing else would notice.
test("parseGuide keeps colliding headings separately linkable", () => {
  const guide = parseGuide("09-x.md", "# X\n\nIntro sentence here.\n\n## Setup\n\nA\n\n## Setup\n\nB\n");
  assert.deepEqual(guide.sections.map((section) => section.id), ["setup", "setup-2"]);
});

test("parseGuide refuses a file with no title rather than producing a nameless guide", () => {
  assert.throws(() => parseGuide("07-broken.md", "No heading here.\n"), /no level-1 heading/);
});

test("every real guide parses into something renderable", () => {
  const guides = buildGuides();
  assert.ok(guides.length >= 6, "expected at least six guides");
  for (const guide of guides) {
    assert.match(guide.slug, /^[a-z0-9-]+$/);
    assert.ok(guide.sections.length > 0, `${guide.slug} has no sections`);
    assert.ok(guide.summary.length > 20, `${guide.slug} has no usable summary`);
  }
});
