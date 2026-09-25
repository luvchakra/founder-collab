import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { buildTracker, expandCitation, parseBacklog, OUTPUT_FILE, OVERRIDES_FILE } from "./build-progress-tracker.mjs";

/**
 * The tracker is only worth having if it is current, so this fails the build when it is
 * not. A status document nobody regenerates is worse than none: people read it, believe
 * it, and plan against a picture of the repository that stopped being true weeks ago.
 */
test("docs/PROGRESS-TRACKER.md is up to date", () => {
  assert.equal(
    readFileSync(OUTPUT_FILE, "utf8"),
    buildTracker().markdown,
    "docs/PROGRESS-TRACKER.md is stale -- run `npm run build:progress`",
  );
});

test("every override names a valid status and says where it comes from", () => {
  const allowed = new Set(["Done", "In progress", "Deferred", "Superseded", "Blocked", "Not started"]);
  const { stories } = JSON.parse(readFileSync(OVERRIDES_FILE, "utf8"));
  for (const [id, override] of Object.entries(stories)) {
    assert.ok(allowed.has(override.status), `${id} has an unknown status: ${override.status}`);
    // An override outranks the evidence in the repository, so it has to carry its own.
    assert.ok(override.note && override.note.length > 10, `${id} needs a note saying where its status comes from`);
  }
});

test("every override refers to a story that still exists in a backlog", () => {
  const { backlogs } = buildTracker();
  const known = new Set(backlogs.flatMap((backlog) => backlog.stories.map((story) => story.id)));
  const { stories } = JSON.parse(readFileSync(OVERRIDES_FILE, "utf8"));
  for (const id of Object.keys(stories)) {
    assert.ok(known.has(id), `${id} is overridden but is not a story in any backlog -- renamed or removed?`);
  }
});

test("a heading without a minor number is an epic, not a story", () => {
  // `## COMPLY-P1-05 — UAE` heads the epic that `### COMPLY-P1-05.1` sits in. Counting the
  // epic as a story of its own would report it as never built, for ever.
  const stories = parseBacklog(
    "11-x.md",
    ["## COMPLY-P1-05 — UAE", "", "### COMPLY-P1-05.1 — VAT Registration", "", "### COMPLY-P1-05.2 — VAT Return"].join("\n"),
  );
  assert.deepEqual(stories.map((story) => story.id), ["COMPLY-P1-05.1", "COMPLY-P1-05.2"]);
  assert.equal(stories[0].epic, "COMPLY-P1-05 — UAE");
});

test("a table row with a multi-part id is a story", () => {
  const stories = parseBacklog("12-x.md", ["## Navigation", "", "| `DISC-NAV-01` | Discovery sidebar hierarchy | M |"].join("\n"));
  assert.deepEqual(stories.map((story) => story.id), ["DISC-NAV-01"]);
});

test("a backlog table row is a story too", () => {
  const stories = parseBacklog(
    "04-x.md",
    ["## Epic 7 — Finance", "", "| ID | Story | Size |", "|---|---|---|", "| `FIN-1` | **Finance exceptions queue** (§38). One place for... | M |"].join("\n"),
  );
  assert.deepEqual(stories.map((story) => [story.id, story.title, story.epic]), [
    ["FIN-1", "Finance exceptions queue", "Epic 7 — Finance"],
  ]);
});

test("expandCitation reads the grouped forms the codebase actually writes", () => {
  assert.deepEqual(expandCitation("DISC-OFFER-P0-05.1"), ["DISC-OFFER-P0-05.1"]);
  assert.deepEqual(expandCitation("PLATFORM-P0-15.1/15.2/15.4"), [
    "PLATFORM-P0-15.1",
    "PLATFORM-P0-15.2",
    "PLATFORM-P0-15.4",
  ]);
  assert.deepEqual(expandCitation("COMPLY-P0-11.1–11.3"), [
    "COMPLY-P0-11.1",
    "COMPLY-P0-11.2",
    "COMPLY-P0-11.3",
  ]);
  // A range across sections is not a sequence anyone meant to enumerate.
  assert.deepEqual(expandCitation("PLATFORM-P0-08.1-09.2"), ["PLATFORM-P0-08.1", "PLATFORM-P0-09.2"]);
  assert.deepEqual(expandCitation("not-a-story-id"), []);
  // The Discovery expansion's ids: two-part prefixes, slash lists and dotted ranges.
  assert.deepEqual(expandCitation("MKT-03..05"), ["MKT-03", "MKT-04", "MKT-05"]);
  assert.deepEqual(expandCitation("FND-01/02/15"), ["FND-01", "FND-02", "FND-15"]);
  assert.deepEqual(expandCitation("DISC-NAV-01..02"), ["DISC-NAV-01", "DISC-NAV-02"]);
});

test("the tracker accounts for every story exactly once", () => {
  const { markdown, backlogs } = buildTracker();
  const total = backlogs.reduce((sum, backlog) => sum + backlog.stories.length, 0);
  assert.ok(total > 300, `expected the backlogs to hold hundreds of stories, found ${total}`);
  assert.match(markdown, new RegExp(`\\\\| \\\\*\\\\*Total\\\\*\\\\* \\\\| \\\\*\\\\*${total}\\\\*\\\\* \\\\|`));

  for (const backlog of backlogs) {
    const ids = backlog.stories.map((story) => story.id);
    assert.equal(new Set(ids).size, ids.length, `${backlog.file} lists a story twice`);
    for (const id of ids) {
      assert.ok(markdown.includes(`\`${id}\``), `${id} is missing from the tracker`);
    }
  }
});
