#!/usr/bin/env node
/**
 * Enforces 00-MASTER-PLAN.md §4: a migration may create/alter tables only in
 * its own module's schema, plus `core`. Mixing two non-core module schemas in
 * one migration file is a bug the schema itself should have caught at review
 * time — this makes it a CI failure instead (04-CLAUDE-CODE-BACKLOG.md).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const DDL_RE = /\b(?:create|alter)\s+table\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?\.\s*"?[a-z_][a-z0-9_]*"?/gi;
const KNOWN_SCHEMAS = new Set(["core", "discovery", "inventory", "fsm", "crm", "gst"]);

/**
 * Lints every migration under `<root>/supabase/migrations`. Returns the violations plus
 * how many files were checked; `missing` distinguishes "no migrations directory yet"
 * from "a directory with no violations", which the CLI reports differently.
 */
export function runMigrationLint(root) {
  const migrationsDir = join(root, "supabase", "migrations");
  let files;
  try {
    files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  } catch {
    return { violations: [], checked: 0, missing: true };
  }

  const violations = [];

  for (const file of files) {
    const full = join(migrationsDir, file);
    const source = readFileSync(full, "utf8");
    const schemasTouched = new Set();
    for (const m of source.matchAll(DDL_RE)) {
      const schema = m[1].toLowerCase();
      if (!KNOWN_SCHEMAS.has(schema)) {
        violations.push(`${relative(root, full)}: unqualified or unknown schema "${schema}" — every table must be schema-qualified with one of: ${[...KNOWN_SCHEMAS].join(", ")}.`);
        continue;
      }
      schemasTouched.add(schema);
    }
    const nonCore = [...schemasTouched].filter((s) => s !== "core");
    if (nonCore.length > 1) {
      violations.push(`${relative(root, full)}: touches multiple module schemas in one file (${nonCore.join(", ")}) — a migration may only touch its own schema plus core.`);
    }
  }

  return { violations, checked: files.length, missing: false };
}

function main() {
  const { violations, checked, missing } = runMigrationLint(ROOT);

  if (missing) {
    console.log("lint:migrations — no supabase/migrations/ directory yet, nothing to check.");
    return;
  }

  if (checked === 0) {
    console.log("lint:migrations — no migration files yet, nothing to check.");
    return;
  }

  if (violations.length > 0) {
    console.error(`Migration schema violations (${violations.length}):\n`);
    for (const v of violations) console.error(`  - ${v}`);
    console.error("");
    process.exit(1);
  }

  console.log(`lint:migrations — ${checked} migration file(s) checked, no violations.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
