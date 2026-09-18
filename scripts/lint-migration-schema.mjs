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
/** `create table <schema>.<name>` — the name too, so grants can be checked per table. */
const CREATE_TABLE_RE = /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?\.\s*"?([a-z_][a-z0-9_]*)"?/gi;
/** `grant ... on [table] a.b, c.d ... to role` — one match per granted table name. */
const GRANT_RE = /\bgrant\b[\s\S]*?\bto\b/gi;
/** A table that deliberately withholds a grant says so, and says why:
 *  `-- lint:no-grant <table> — <reason>` */
const NO_GRANT_RE = /--\s*lint:no-grant\s+([a-z_][a-z0-9_]*)/gi;
const KNOWN_SCHEMAS = new Set(["core", "discovery", "inventory", "fsm", "crm", "gst", "platform"]);
/** Migrations from this filename onward must grant on every table they create. See the
 *  grant check below for why earlier ones are grandfathered. */
const GRANT_RULE_FROM = "20260918130000";

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

  // Grants are collected across the WHOLE timeline before anything is checked: a grant
  // legitimately lands in a later migration than the create (a table whose privileges were
  // fixed afterwards, as 20260918130000 did for Finance), and reading files in isolation
  // would call that a violation.
  const grantedAnywhere = new Set();
  const exemptAnywhere = new Set();
  for (const file of files) {
    const source = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const g of source.match(GRANT_RE) ?? []) {
      for (const m of g.matchAll(/([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/gi)) {
        grantedAnywhere.add(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`);
      }
    }
    for (const m of source.matchAll(NO_GRANT_RE)) exemptAnywhere.add(m[1].toLowerCase());
  }

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

    // Every new table needs a GRANT. RLS narrows what a role may reach; it does not grant
    // the reach in the first place, so a table with policies and no grant is unreadable to
    // `authenticated` and every page over it fails with "permission denied for table".
    //
    // Supabase does eventually grant privileges on new tables in exposed schemas on its own
    // schedule, which is why this has never bitten before: by the time anyone visits a page,
    // the grant has usually landed. On 2026-09-18 three Finance pages (Banking, Recurring
    // Entries, Budget) were visited inside that window and all three 500'd with "permission
    // denied for table bank_accounts". The window is invisible and its length is not ours to
    // control, so the grant belongs in the migration.
    //
    // Grandfathered before the cutoff: 112 existing tables across every schema rely on that
    // same automation and all work today. Rewriting them is a change nobody asked for and a
    // large one; holding new tables to the rule stops the bug recurring without it. Raise the
    // cutoff, never lower it.
    if (file < GRANT_RULE_FROM) continue;

    for (const m of source.matchAll(CREATE_TABLE_RE)) {
      const schema = m[1].toLowerCase();
      const table = m[2].toLowerCase();
      if (grantedAnywhere.has(`${schema}.${table}`) || exemptAnywhere.has(table)) continue;
      violations.push(
        `${relative(ROOT, full)}: creates "${m[1]}.${table}" but never grants on it — RLS policies alone leave it unreadable ("permission denied for table ${table}"). Add a grant, or, if that is deliberate, mark it: -- lint:no-grant ${table} — <reason>`,
      );
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
