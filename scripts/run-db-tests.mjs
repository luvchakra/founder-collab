#!/usr/bin/env node
/**
 * Runs the DB/RLS test scripts (`scripts/test-*.mjs`, each against its own throwaway
 * database -- scripts/lib/rls-test-harness.mjs) in parallel. Builds the migrated template
 * database once up front, so the scripts only ever copy it.
 *
 * Usage:
 *   node scripts/run-db-tests.mjs                     every DB test script
 *   node scripts/run-db-tests.mjs test-fsm-rls.mjs …  just these
 *
 * DB_TEST_CONCURRENCY overrides the parallelism (default: CPU count). Every script runs
 * even after one fails, so a single run reports every failure; output is printed per
 * script when it finishes, never interleaved.
 */
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { ensureTemplateDatabase } from "./lib/rls-test-harness.mjs";

const SCRIPTS_DIR = new URL(".", import.meta.url).pathname;
const ROOT = new URL("..", import.meta.url).pathname;

/** Every DB test script: `test-*.mjs`, minus the module runner, which isn't one. */
export function allDbTestScripts() {
  return readdirSync(SCRIPTS_DIR)
    .filter((f) => /^test-.*\.mjs$/.test(f) && f !== "test-module.mjs")
    .sort();
}

function runScript(file) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [join(SCRIPTS_DIR, file)], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => resolve({ file, code, output, seconds: (Date.now() - started) / 1000 }));
  });
}

async function main() {
  const requested = process.argv.slice(2);
  const scripts = requested.length > 0 ? requested : allDbTestScripts();
  const unknown = scripts.filter((f) => !allDbTestScripts().includes(f));
  if (unknown.length > 0) {
    console.error(`Not DB test scripts: ${unknown.join(", ")}`);
    process.exit(2);
  }

  ensureTemplateDatabase({
    migrationsDir: join(ROOT, "supabase", "migrations"),
    stubFile: join(ROOT, "supabase", "tests", "local-stub.sql"),
  });

  const concurrency = Number(process.env.DB_TEST_CONCURRENCY) || availableParallelism();
  console.log(`Running ${scripts.length} DB test script(s), ${concurrency} at a time...`);
  const queue = [...scripts];
  const failures = [];
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length > 0) {
        const result = await runScript(queue.shift());
        if (result.code === 0) {
          console.log(`ok   ${result.file} (${result.seconds.toFixed(1)}s)`);
        } else {
          failures.push(result.file);
          console.log(`FAIL ${result.file} (${result.seconds.toFixed(1)}s)\n${result.output}`);
        }
      }
    }),
  );

  if (failures.length > 0) {
    console.error(`\n${failures.length} of ${scripts.length} DB test script(s) failed: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log(`\nAll ${scripts.length} DB test script(s) passed.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
