#!/usr/bin/env node
/**
 * A table with RLS policies but no `grant` to `authenticated` is unreachable from the
 * app, and fails in a way that looks nothing like a permissions bug.
 *
 * RLS is a filter applied *after* the privilege check, not instead of it. A table with
 * policies but no grant rejects every client read at the privilege check —
 * `42501 permission denied for table ...` — before a policy is ever consulted. The
 * policies look right, the table looks right, and the page renders a generic error
 * boundary. This shipped three times in one day (gst_banking, gst_recurring_entries,
 * gst_budgets: five tables, thirty-eight lines of correct, unreachable policy) and took
 * out /finance/banking, /finance/budget, /finance/recurring and the recurring-entries
 * cron until 20260918130000_gst_finance_table_grants.sql granted what they needed.
 *
 * The rule is keyed on policies rather than on RLS alone, because "has policies" is what
 * separates a table meant to be reached by a signed-in user from one that is deliberately
 * service-role-only. `core.demo_seed_records`, `core.demo_seed_batches` and
 * `platform.ai_provider_keys` each have RLS on and zero policies: reached only by the
 * admin client, correctly carrying no `authenticated` grant, and correctly not flagged
 * here.
 *
 * Grants are collected across the whole migration set, not per file, since the fix for an
 * older migration legitimately lands in a newer one.
 *
 * `runLint(root)` is exported so lint-migration-grants.test.mjs can prove the rule bites
 * against a fixture tree, matching lint-import-boundaries.mjs's own convention.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const DEFAULT_ROOT = new URL("..", import.meta.url).pathname;

/** `create table [if not exists] schema.name` — the same shape lint-migration-schema.mjs
 * matches, so the two linters agree on what counts as a table. */
const CREATE_TABLE_RE =
  /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?\s*\.\s*"?([a-z_][a-z0-9_]*)"?/gi;

/** `create policy "..." on schema.name` — the policy body is irrelevant here, only which
 * table it attaches to. */
const CREATE_POLICY_RE =
  /\bcreate\s+policy\s+(?:"[^"]*"|[a-z_][a-z0-9_]*)\s+on\s+"?([a-z_][a-z0-9_]*)"?\s*\.\s*"?([a-z_][a-z0-9_]*)"?/gi;

/** `grant <privileges> on <targets> to <roles>;` — targets may be a comma-separated list
 * spanning lines, which is how the accounting foundation migration writes its
 * service_role grant. */
const GRANT_RE = /\bgrant\s+[\s\S]*?\s+on\s+([\s\S]*?)\s+to\s+([a-z_][a-z0-9_,\s"]*?);/gi;

/** `grant ... on all tables in schema <s> to <roles>` covers every table in that schema at
 * once, so it is tracked by schema rather than by table name. */
const ALL_TABLES_RE = /^\s*all\s+tables\s+in\s+schema\s+"?([a-z_][a-z0-9_]*)"?\s*$/i;

/**
 * Strips `--` line comments and block comments before any matching.
 *
 * Not cosmetic: these migrations discuss grants in prose ("there is no INSERT/UPDATE/
 * DELETE grant to ...", "don't grant a capability nothing calls"), and because a regex
 * match consumes its input, a match that starts at the word "grant" inside a comment eats
 * the real statement that follows it — which reported twenty-three tables as ungranted
 * when only five were. Applied to every pattern here, so a commented-out `create table`
 * or `create policy` is likewise not mistaken for the real thing.
 */
function stripSqlComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function parseRoles(raw) {
  return raw
    .split(",")
    .map((r) => r.trim().replace(/"/g, "").toLowerCase())
    .filter(Boolean);
}

/** Pulls `schema.table` pairs out of a grant's target list, skipping the non-table
 * targets that share the `grant ... on ... to ...` shape (functions, sequences, schema
 * usage) — those never satisfy a table grant and must not be mistaken for one. */
function parseGrantTargets(rawTargets) {
  const targets = rawTargets.replace(/\btable\s+/gi, "").trim();

  const allTables = targets.match(ALL_TABLES_RE);
  if (allTables) return { schemaWide: allTables[1].toLowerCase(), tables: [] };

  if (/^\s*(?:function|procedure|routine|sequence|schema|database|type|domain)\b/i.test(targets)) {
    return { schemaWide: null, tables: [] };
  }

  const tables = [];
  for (const piece of targets.split(",")) {
    const m = piece.trim().match(/^"?([a-z_][a-z0-9_]*)"?\s*\.\s*"?([a-z_][a-z0-9_]*)"?$/i);
    if (m) tables.push(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`);
  }
  return { schemaWide: null, tables };
}

export function runLint(root = DEFAULT_ROOT) {
  const migrationsDir = join(root, "supabase", "migrations");
  let files;
  try {
    files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  } catch {
    return { violations: [], fileCount: 0, tableCount: 0 };
  }

  const createdTables = new Set();
  /** table -> the migration that first gives it a policy, for the error message. */
  const policyTables = new Map();
  const grantedToAuthenticated = new Set();
  const schemasGrantedWholesale = new Set();

  for (const file of files) {
    const source = stripSqlComments(readFileSync(join(migrationsDir, file), "utf8"));

    for (const m of source.matchAll(CREATE_TABLE_RE)) {
      createdTables.add(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`);
    }
    for (const m of source.matchAll(CREATE_POLICY_RE)) {
      const table = `${m[1].toLowerCase()}.${m[2].toLowerCase()}`;
      if (!policyTables.has(table)) policyTables.set(table, file);
    }
    for (const m of source.matchAll(GRANT_RE)) {
      if (!parseRoles(m[2]).includes("authenticated")) continue;
      const { schemaWide, tables } = parseGrantTargets(m[1]);
      if (schemaWide) schemasGrantedWholesale.add(schemaWide);
      for (const t of tables) grantedToAuthenticated.add(t);
    }
  }

  const violations = [];
  for (const [table, file] of [...policyTables].sort()) {
    // A policy on a table this migration set never creates is someone else's table
    // (a Supabase-managed one, say) — not this rule's business.
    if (!createdTables.has(table)) continue;
    if (grantedToAuthenticated.has(table)) continue;
    if (schemasGrantedWholesale.has(table.split(".")[0])) continue;
    violations.push(
      `${table}: has RLS policies (first in supabase/migrations/${file}) but is never granted to "authenticated" — ` +
        `RLS filters rows only after the privilege check, so every client read fails with 42501 before a policy runs. ` +
        `Add e.g. \`grant select, insert, update on ${table} to authenticated;\` (match the commands its policies cover), ` +
        `or drop the policies if the table is meant to be service-role-only.`,
    );
  }

  return { violations, fileCount: files.length, tableCount: policyTables.size, migrationsDir };
}

function main() {
  const { violations, fileCount, tableCount, migrationsDir } = runLint();
  if (migrationsDir === undefined) {
    console.log("lint:migration-grants — no supabase/migrations/ directory yet, nothing to check.");
    return;
  }
  if (violations.length > 0) {
    console.error(`Migration grant violations (${violations.length}):\n`);
    for (const v of violations) console.error(`  - ${v}`);
    console.error("");
    process.exit(1);
  }
  console.log(
    `lint:migration-grants — ${fileCount} migration file(s), ${tableCount} table(s) with policies, all granted.`,
  );
}

if (process.argv[1] && process.argv[1].endsWith("lint-migration-grants.mjs")) main();
