#!/usr/bin/env node
/**
 * `npm run typecheck`: every workspace's `tsc --noEmit`, in parallel and incremental.
 * Build info lives in `.cache/tsc/` (gitignored; CI restores it between runs), so a run
 * re-checks only what changed since the last one -- tsc keys it on file contents, not
 * timestamps, which is what lets a fresh CI checkout reuse it. Sequential and cold, this
 * was ~110s locally; parallel and warm it is ~10s.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const CACHE_DIR = join(ROOT, ".cache", "tsc");
// The root package.json's `workspaces` globs: apps/* and packages/*.
const WORKSPACE_DIRS = ["apps", "packages"].flatMap((parent) =>
  readdirSync(join(ROOT, parent), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${parent}/${entry.name}`),
);

function hasTypecheckScript(dir) {
  const pkgFile = join(ROOT, dir, "package.json");
  return existsSync(pkgFile) && Boolean(JSON.parse(readFileSync(pkgFile, "utf8")).scripts?.typecheck);
}

function typecheck(dir) {
  return new Promise((resolve) => {
    const started = Date.now();
    const buildInfo = join(CACHE_DIR, `${dir.replace(/\//g, "_")}.tsbuildinfo`);
    const child = spawn("npx", ["tsc", "--noEmit", "--incremental", "--tsBuildInfoFile", buildInfo], {
      cwd: join(ROOT, dir),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => resolve({ dir, code, output, seconds: (Date.now() - started) / 1000 }));
  });
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const queue = WORKSPACE_DIRS.filter(hasTypecheckScript);
  const failures = [];
  await Promise.all(
    Array.from({ length: Math.min(availableParallelism(), queue.length) }, async () => {
      while (queue.length > 0) {
        const result = await typecheck(queue.shift());
        console.log(`${result.code === 0 ? "ok  " : "FAIL"} ${result.dir} (${result.seconds.toFixed(1)}s)`);
        if (result.code !== 0) {
          failures.push(result.dir);
          console.log(result.output);
        }
      }
    }),
  );
  if (failures.length > 0) {
    console.error(`Typecheck failed in: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main();
