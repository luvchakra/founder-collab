#!/usr/bin/env node
/**
 * Summarises a Playwright JSON report (apps/web/test-results/results.json) for the nightly
 * E2E run (.github/workflows/e2e-nightly.yml): passed / failed / flaky / skipped / not run,
 * which tests failed or were flaky, and the slowest spec files by measured time (what to
 * split on if a run ever grows past its budget).
 *
 *   failed    failed on every attempt
 *   flaky     failed, then passed on the retry -- reported, never counted as a pass
 *   skipped   skipped by the test itself (test.skip / an unmet E2E_* precondition)
 *   not run   never finished: cut off by the time budget, or its setup project failed
 *
 * Writes Markdown to $GITHUB_STEP_SUMMARY and counts to $GITHUB_OUTPUT when set. Exits 1
 * when anything failed or didn't run, or the report is missing (Playwright never got far
 * enough to write one); flaky alone exits 0 and is alerted on separately.
 *
 * Usage: node scripts/e2e-summary.mjs <results.json>
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";

function* specsOf(suite) {
  for (const spec of suite.specs ?? []) yield spec;
  for (const child of suite.suites ?? []) yield* specsOf(child);
}

/** Pure: a parsed Playwright JSON report -> counts, named failures and per-file time. */
export function summarise(report) {
  const counts = { passed: 0, failed: 0, flaky: 0, skipped: 0, notRun: 0 };
  const failed = [];
  const flaky = [];
  const notRun = [];
  const fileMs = new Map();
  for (const top of report.suites ?? []) {
    for (const spec of specsOf(top)) {
      for (const test of spec.tests ?? []) {
        const results = test.results ?? [];
        const name = `[${test.projectName}] ${spec.file}:${spec.line} › ${spec.title}`;
        const ms = results.reduce((sum, r) => sum + (r.duration ?? 0), 0);
        fileMs.set(spec.file, (fileMs.get(spec.file) ?? 0) + ms);
        const interrupted = results.length === 0 || results.some((r) => r.status === "interrupted");
        if (test.status === "expected") counts.passed++;
        else if (test.status === "flaky") (counts.flaky++, flaky.push(name));
        else if (test.status === "unexpected" && !interrupted) (counts.failed++, failed.push(name));
        else if (test.status === "skipped" && !interrupted) counts.skipped++;
        else (counts.notRun++, notRun.push(name));
      }
    }
  }
  const slowest = [...fileMs.entries()].sort((a, b) => b[1] - a[1]).map(([file, ms]) => ({ file, ms }));
  return { counts, failed, flaky, notRun, slowest, totalMs: report.stats?.duration ?? 0 };
}

const minutes = (ms) => `${(ms / 60000).toFixed(1)} min`;

export function toMarkdown(s) {
  const { counts } = s;
  const lines = [
    "## E2E results",
    "",
    "| passed | failed | flaky | skipped | not run | wall time |",
    "|---:|---:|---:|---:|---:|---:|",
    `| ${counts.passed} | ${counts.failed} | ${counts.flaky} | ${counts.skipped} | ${counts.notRun} | ${minutes(s.totalMs)} |`,
  ];
  const list = (title, names) => names.length && lines.push("", `### ${title}`, "", ...names.slice(0, 50).map((n) => `- ${n}`));
  list("Failed", s.failed);
  list("Flaky (passed only on retry -- needs a root cause)", s.flaky);
  list("Not run (time budget or failed setup)", s.notRun);
  lines.push("", "### Slowest spec files (summed test time)", "", "| spec file | time |", "|---|---:|");
  for (const { file, ms } of s.slowest.slice(0, 10)) lines.push(`| ${file} | ${minutes(ms)} |`);
  return `${lines.join("\n")}\n`;
}

function main() {
  const path = process.argv[2];
  if (!path || !existsSync(path)) {
    const message = `No Playwright report at ${path}: the run stopped before any test reported.`;
    console.error(message);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## E2E results\n\n${message}\n`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, "failed=unknown\nflaky=0\n");
    process.exit(1);
  }
  const s = summarise(JSON.parse(readFileSync(path, "utf8")));
  const markdown = toMarkdown(s);
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  if (process.env.GITHUB_OUTPUT) {
    const c = s.counts;
    appendFileSync(process.env.GITHUB_OUTPUT, `passed=${c.passed}\nfailed=${c.failed}\nflaky=${c.flaky}\nskipped=${c.skipped}\nnot_run=${c.notRun}\n`);
  }
  process.exit(s.counts.failed > 0 || s.counts.notRun > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
