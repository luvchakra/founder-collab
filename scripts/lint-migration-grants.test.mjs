// Fixture-based, matching lint-gst-no-duplicate-masters.test.mjs's convention: build a
// throwaway supabase/migrations/ tree per case rather than asserting against the real
// repo, so these stay meaningful once the repo has zero violations.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLint } from "./lint-migration-grants.mjs";

function makeFixture(migrationFiles) {
  const root = mkdtempSync(join(tmpdir(), "migration-grants-fixture-"));
  const migrationsDir = join(root, "supabase", "migrations");
  mkdirSync(migrationsDir, { recursive: true });
  for (const [name, content] of Object.entries(migrationFiles)) {
    writeFileSync(join(migrationsDir, name), content);
  }
  return root;
}

const TABLE = `create table gst.bank_accounts (\n  id uuid primary key,\n  business_id uuid not null\n);\n`;
const POLICY = `create policy "members can view" on gst.bank_accounts for select\n  using (business_id in (select core.user_business_ids()));\n`;

// The exact defect this rule exists for: the shape gst_banking, gst_recurring_entries and
// gst_budgets all shipped with.
test("flags a table with policies that is never granted to authenticated", () => {
  const root = makeFixture({ "20990101000000_gst_banking.sql": TABLE + POLICY });
  try {
    const { violations } = runLint(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /gst\.bank_accounts/);
    assert.match(violations[0], /never granted to "authenticated"/);
    assert.match(violations[0], /42501/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a service_role-only grant does not satisfy the rule", () => {
  const root = makeFixture({
    "20990101000000_gst_banking.sql": `${TABLE}${POLICY}grant all on gst.bank_accounts to service_role;\n`,
  });
  try {
    assert.equal(runLint(root).violations.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts a table granted to authenticated in the same migration", () => {
  const root = makeFixture({
    "20990101000000_gst_banking.sql": `${TABLE}${POLICY}grant select, insert, update on gst.bank_accounts to authenticated;\n`,
  });
  try {
    assert.deepEqual(runLint(root).violations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// How the real fix landed: the grant belongs to a later migration than the table.
test("accepts a grant issued by a later migration", () => {
  const root = makeFixture({
    "20990101000000_gst_banking.sql": TABLE + POLICY,
    "20990102000000_gst_banking_grants.sql": `grant select on gst.bank_accounts to authenticated;\n`,
  });
  try {
    assert.deepEqual(runLint(root).violations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts a multi-table grant list spanning lines", () => {
  const root = makeFixture({
    "20990101000000_gst_banking.sql":
      TABLE +
      POLICY +
      `create table gst.bank_transactions (\n  id uuid primary key\n);\n` +
      `create policy "members can view txns" on gst.bank_transactions for select using (true);\n` +
      `grant select on gst.bank_accounts,\n  gst.bank_transactions to authenticated;\n`,
  });
  try {
    assert.deepEqual(runLint(root).violations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts a schema-wide grant", () => {
  const root = makeFixture({
    "20990101000000_gst_banking.sql": `${TABLE}${POLICY}grant select on all tables in schema gst to authenticated;\n`,
  });
  try {
    assert.deepEqual(runLint(root).violations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// A deliberately service-role-only table — core.demo_seed_records and
// platform.ai_provider_keys are the real examples. No policies, so not this rule's
// business, and flagging them would make the rule noise.
test("ignores a table with RLS but no policies at all", () => {
  const root = makeFixture({
    "20990101000000_core_seed.sql": `create table core.demo_seed_records (\n  id uuid primary key\n);\nalter table core.demo_seed_records enable row level security;\ngrant all on core.demo_seed_records to service_role;\n`,
  });
  try {
    assert.deepEqual(runLint(root).violations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// The false-positive class that made the first version of this linter report 23 tables
// when only 5 were broken: a regex match starting at "grant" inside prose consumed the
// real statement that followed.
test("is not fooled by the words grant/create in comments", () => {
  const root = makeFixture({
    "20990101000000_gst_banking.sql":
      `-- There is no INSERT/UPDATE/DELETE grant to authenticated here on purpose, and\n` +
      `-- nothing should create table gst.ghost or create policy "x" on gst.ghost.\n` +
      `/* Another note: don't grant a capability nothing calls. */\n` +
      TABLE +
      POLICY +
      `grant select on gst.bank_accounts to authenticated;\n`,
  });
  try {
    const { violations } = runLint(root);
    assert.deepEqual(violations, []);
    // The commented-out table never entered the table set either.
    assert.equal(runLint(root).tableCount, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ignores a policy on a table this migration set never creates", () => {
  const root = makeFixture({
    "20990101000000_external.sql": `create policy "p" on storage.objects for select using (true);\n`,
  });
  try {
    assert.deepEqual(runLint(root).violations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a function or schema grant is not mistaken for a table grant", () => {
  const root = makeFixture({
    "20990101000000_gst_banking.sql":
      TABLE +
      POLICY +
      `grant usage on schema gst to authenticated;\n` +
      `grant execute on function gst.something(uuid) to authenticated;\n`,
  });
  try {
    assert.equal(runLint(root).violations.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports nothing when there is no migrations directory", () => {
  const root = mkdtempSync(join(tmpdir(), "migration-grants-empty-"));
  try {
    assert.deepEqual(runLint(root).violations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
