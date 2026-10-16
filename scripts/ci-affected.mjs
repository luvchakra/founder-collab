#!/usr/bin/env node
/**
 * Decides which CI jobs a change actually needs, so a pull request runs the checks for the
 * files it touches rather than the whole suite (docs/testing/what-runs-where.md). Prints
 * `key=value` lines -- and appends them to $GITHUB_OUTPUT when set:
 *
 *   code   typecheck + lint + unit tests are needed (false when only docs changed)
 *   unit   "all" or "changed" -- `vitest --changed <base>` runs the tests related to the
 *          changed files by following imports, so a change in packages/core still runs the
 *          apps/web tests that depend on it
 *   lint   "all" or "changed" -- ESLint on the whole app, or on the changed files only
 *          (scripts/lint-changed.mjs)
 *   build  `next build` is needed (something the deployed app is built from changed)
 *   db     DB/RLS test scripts to run: "all", a space-separated list, or empty
 *
 * End-to-end tests never run here: they run nightly (.github/workflows/e2e-nightly.yml).
 *
 * Usage: node scripts/ci-affected.mjs <base-ref>   (no base, or an unknown one -> full run)
 * CI_EVENT=push (a merge to main) always runs every unit test and the whole lint.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { allDbTestScripts } from "./run-db-tests.mjs";

const FULL = { code: true, unit: "all", lint: "all", build: true, db: "all" };

/** Changing any of these changes how everything else is tested, so it re-runs everything. */
const FULL_RUN_TRIGGERS = [
  /^\.github\/workflows\//,
  /^scripts\/ci-affected\.mjs$/,
  /^scripts\/lint-changed\.mjs$/,
  /^scripts\/run-db-tests\.mjs$/,
  /^scripts\/lib\//,
  /^supabase\/tests\//,
];

/** Documentation only: nothing to typecheck, lint, unit-test or build. scripts/*.test.mjs
 * (help content, progress tracker) still run for these -- they are always cheap. */
const isDocsOnly = (file) => /^docs\//.test(file) || /\.md$/i.test(file);

/**
 * Dependencies, TypeScript, test, lint and build config: a change here can affect any test
 * or any file's lint result, which neither `vitest --changed` nor a changed-files lint can
 * see, so it runs every unit test and the whole lint.
 */
const CONFIG_TRIGGERS = [
  /(^|\/)package(-lock)?\.json$/,
  /(^|\/)tsconfig[^/]*\.json$/,
  /(^|\/)vitest\.(config|setup|workspace)[^/]*\.[cm]?[jt]s$/,
  /(^|\/)eslint\.config\.[cm]?[jt]s$/,
  /(^|\/)\.eslintrc/,
  /(^|\/)next\.config\.[cm]?[jt]s$/,
  /(^|\/)postcss\.config\.[cm]?[jt]s$/,
  /(^|\/)playwright\.config\.[cm]?[jt]s$/,
];

/** What the deployed app is built from (apps/web imports every package as source). */
const affectsBuild = (file) => /^(apps|packages)\//.test(file) || /^package(-lock)?\.json$/.test(file);

/**
 * A migration's name starts with the area it belongs to (`20260908010000_fsm_schema.sql`).
 * Module migrations run that module's DB tests (finance lives in gst); `core` and anything
 * unrecognised can change RLS helpers every module relies on, so they run them all.
 */
const MIGRATION_AREAS = {
  discovery: ["discovery"],
  inventory: ["inventory", "sales"],
  sales: ["inventory", "sales"],
  fsm: ["fsm"],
  crm: ["crm"],
  gst: ["gst", "finance"],
  platform: ["platform"],
};

export function selectAffected(changedFiles, dbScripts = allDbTestScripts(), { event = "pull_request" } = {}) {
  const files = changedFiles.filter(Boolean);
  if (files.some((file) => FULL_RUN_TRIGGERS.some((re) => re.test(file)))) return { ...FULL };

  const codeFiles = files.filter((file) => !isDocsOnly(file));
  const db = new Set();
  let allDb = false;
  for (const file of files) {
    const migration = file.match(/^supabase\/migrations\/\d+_([a-z]+)[^/]*\.sql$/);
    if (migration) {
      const areas = MIGRATION_AREAS[migration[1]];
      if (!areas) {
        allDb = true;
        continue;
      }
      for (const script of dbScripts) {
        if (areas.some((area) => script.startsWith(`test-${area}-`))) db.add(script);
      }
      // Every migration can add a view; this one checks they are all security_invoker.
      for (const script of dbScripts) if (script.startsWith("test-views-")) db.add(script);
      continue;
    }
    const script = file.match(/^scripts\/(test-[^/]+\.mjs)$/);
    if (script && dbScripts.includes(script[1])) db.add(script[1]);
  }

  const everything = event === "push" || codeFiles.some((file) => CONFIG_TRIGGERS.some((re) => re.test(file)));
  return {
    code: codeFiles.length > 0,
    unit: everything ? "all" : "changed",
    lint: everything ? "all" : "changed",
    build: files.some(affectsBuild),
    db: allDb ? "all" : [...db].sort().join(" "),
  };
}

function changedFilesSince(base) {
  try {
    execFileSync("git", ["cat-file", "-e", `${base}^{commit}`], { stdio: "ignore" });
  } catch {
    return null;
  }
  return execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" }).split("\n");
}

function main() {
  const base = process.argv[2];
  const changed = base && !/^0+$/.test(base) ? changedFilesSince(base) : null;
  const event = process.env.CI_EVENT ?? "pull_request";
  const result = changed ? selectAffected(changed, allDbTestScripts(), { event }) : { ...FULL };
  const lines = Object.entries(result).map(([key, value]) => `${key}=${value}`);
  console.log(changed ? `${changed.filter(Boolean).length} file(s) changed since ${base} (${event})` : "No usable base: full run");
  console.log(lines.join("\n"));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
