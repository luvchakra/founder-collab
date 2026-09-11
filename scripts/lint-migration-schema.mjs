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
const KNOWN_SCHEMAS = new Set(["core", "discovery", "inventory", "fsm", "crm", "gst", "platform"]);

function main() {
  let files;
  try {
    files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  } catch {
    console.log("lint:migrations — no supabase/migrations/ directory yet, nothing to check.");
    return;
  }

  if (files.length === 0) {
    console.log("lint:migrations — no migration files yet, nothing to check.");
    return;
  }

  const violations = [];

  for (const file of files) {
    const full = join(MIGRATIONS_DIR, file);
    const source = readFileSync(full, "utf8");
    const schemasTouched = new Set();
    for (const m of source.matchAll(DDL_RE)) {
      const schema = m[1].toLowerCase();
      if (!KNOWN_SCHEMAS.has(schema)) {
        violations.push(`${relative(ROOT, full)}: unqualified or unknown schema "${schema}" — every table must be schema-qualified with one of: ${[...KNOWN_SCHEMAS].join(", ")}.`);
        continue;
      }
      schemasTouched.add(schema);
    }
    const nonCore = [...schemasTouched].filter((s) => s !== "core");
    if (nonCore.length > 1) {
      violations.push(`${relative(ROOT, full)}: touches multiple module schemas in one file (${nonCore.join(", ")}) — a migration may only touch its own schema plus core.`);
    }
  }

  if (violations.length > 0) {
    console.error(`Migration schema violations (${violations.length}):\n`);
    for (const v of violations) console.error(`  - ${v}`);
    console.error("");
    process.exit(1);
  }

  console.log(`lint:migrations — ${files.length} migration file(s) checked, no violations.`);
}

main();
