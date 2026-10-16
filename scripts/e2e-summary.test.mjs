import { test } from "node:test";
import assert from "node:assert/strict";
import { summarise, toMarkdown } from "./e2e-summary.mjs";

const t = (projectName, status, results) => ({ projectName, status, results });
const r = (status, duration = 1000) => ({ status, duration });

const report = {
  stats: { duration: 120000 },
  suites: [
    {
      file: "security/storage.spec.ts",
      specs: [
        { file: "security/storage.spec.ts", line: 10, title: "passes", tests: [t("security", "expected", [r("passed", 5000)])] },
        { file: "security/storage.spec.ts", line: 20, title: "flakes", tests: [t("security", "flaky", [r("failed", 3000), r("passed", 2000)])] },
      ],
      suites: [
        {
          specs: [{ file: "security/storage.spec.ts", line: 30, title: "fails", tests: [t("security", "unexpected", [r("failed"), r("failed")])] }],
        },
      ],
    },
    {
      file: "authenticated/crm.spec.ts",
      specs: [
        { file: "authenticated/crm.spec.ts", line: 5, title: "skips itself", tests: [t("desktop", "skipped", [r("skipped", 0)])] },
        { file: "authenticated/crm.spec.ts", line: 6, title: "never started", tests: [t("desktop", "skipped", [])] },
        { file: "authenticated/crm.spec.ts", line: 7, title: "cut off", tests: [t("mobile", "unexpected", [r("interrupted", 400)])] },
      ],
    },
  ],
};

test("counts passed, failed, flaky, self-skipped and not-run tests separately", () => {
  const s = summarise(report);
  assert.deepEqual(s.counts, { passed: 1, failed: 1, flaky: 1, skipped: 1, notRun: 2 });
  assert.deepEqual(s.failed, ["[security] security/storage.spec.ts:30 › fails"]);
  assert.deepEqual(s.flaky, ["[security] security/storage.spec.ts:20 › flakes"]);
  assert.deepEqual(s.notRun, ["[desktop] authenticated/crm.spec.ts:6 › never started", "[mobile] authenticated/crm.spec.ts:7 › cut off"]);
});

test("ranks spec files by measured time, retries included", () => {
  assert.deepEqual(summarise(report).slowest, [
    { file: "security/storage.spec.ts", ms: 12000 },
    { file: "authenticated/crm.spec.ts", ms: 400 },
  ]);
});

test("the Markdown names the flaky test as needing a root cause", () => {
  const markdown = toMarkdown(summarise(report));
  assert.match(markdown, /\| 1 \| 1 \| 1 \| 1 \| 2 \| 2\.0 min \|/);
  assert.match(markdown, /Flaky \(passed only on retry -- needs a root cause\)\n\n- \[security\] security\/storage\.spec\.ts:20 › flakes/);
});
