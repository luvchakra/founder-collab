#!/usr/bin/env node
/**
 * ESLint on the files a pull request changed, instead of the whole app
 * (docs/testing/what-runs-where.md). ESLint is configured in apps/web only
 * (apps/web/eslint.config.mjs), so only changed, still-present JS/TS files under apps/web
 * are linted; with none, this passes without starting ESLint. A config or CI change
 * makes scripts/ci-affected.mjs choose the whole lint instead.
 *
 * Usage: node scripts/lint-changed.mjs <base-ref>
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const LINTED_ROOT = "apps/web/";
const LINTABLE = /\.(?:[cm]?[jt]sx?)$/;

/** Changed files ESLint should look at, relative to apps/web. */
export function lintTargets(changedFiles, exists = existsSync) {
  return changedFiles
    .filter((file) => file.startsWith(LINTED_ROOT) && LINTABLE.test(file) && exists(file))
    .map((file) => file.slice(LINTED_ROOT.length));
}

function main() {
  const base = process.argv[2];
  if (!base) {
    console.error("Usage: node scripts/lint-changed.mjs <base-ref>");
    process.exit(2);
  }
  const changed = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`], { encoding: "utf8" }).split("\n").filter(Boolean);
  const targets = lintTargets(changed);
  if (targets.length === 0) {
    console.log("No changed JS/TS files under apps/web: nothing to lint.");
    return;
  }
  console.log(`Linting ${targets.length} changed file(s):\n  ${targets.join("\n  ")}`);
  // The same cache the workspace `lint` script uses, so a later whole lint reuses it.
  const result = spawnSync(
    "npx",
    ["eslint", "--cache", "--cache-strategy", "content", "--cache-location", "../../.cache/eslint/", "--no-warn-ignored", "--", ...targets],
    { cwd: LINTED_ROOT, stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
