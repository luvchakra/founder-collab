// Fixture test for the lint:migrations CI gate, mirroring lint-import-boundaries.test.mjs:
// each case builds a throwaway supabase/migrations/ tree rather than asserting against the
// real one, so the test keeps proving the rule bites even once every real migration is clean.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrationLint } from "./lint-migration-schema.mjs";

function makeFixture(migrations) {
  const root = mkdtempSync(join(tmpdir(), "migration-fixture-"));
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  for (const [name, sql] of Object.entries(migrations)) {
    writeFileSync(join(root, "supabase", "migrations", name), sql);
  }
  return root;
}

function withFixture(migrations, assertions) {
  const root = makeFixture(migrations);
  try {
    assertions(runMigrationLint(root), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("flags one migration touching two module schemas", () => {
  withFixture(
    {
      "20260101000000_mixed.sql": `
        create table inventory.warehouses (id uuid primary key);
        create table fsm.jobs (id uuid primary key);
      `,
    },
    ({ violations }) => {
      assert.equal(violations.length, 1);
      assert.match(violations[0], /20260101000000_mixed\.sql/);
      assert.match(violations[0], /touches multiple module schemas/);
    },
  );
});

test("allows a module schema alongside core in the same migration", () => {
  withFixture(
    {
      "20260101000000_inventory.sql": `
        create table core.items (id uuid primary key);
        create table inventory.warehouses (id uuid primary key);
        alter table inventory.warehouses add column name text;
      `,
    },
    ({ violations, checked }) => {
      assert.deepEqual(violations, []);
      assert.equal(checked, 1);
    },
  );
});

test("allows a core-only migration", () => {
  withFixture(
    { "20260101000000_core.sql": `create table core.licenses (id uuid primary key);` },
    ({ violations }) => assert.deepEqual(violations, []),
  );
});

test("flags a table created without a schema qualifier", () => {
  withFixture(
    { "20260101000000_bare.sql": `create table products (id uuid primary key);` },
    ({ violations }) => {
      assert.equal(violations.length, 1);
      assert.match(violations[0], /unqualified table "products"/);
    },
  );
});

test("flags an unqualified ALTER TABLE too", () => {
  withFixture(
    { "20260101000000_bare_alter.sql": `alter table products add column sku text;` },
    ({ violations }) => {
      assert.equal(violations.length, 1);
      assert.match(violations[0], /unqualified table "products"/);
    },
  );
});

test("flags an unqualified 'create table if not exists'", () => {
  withFixture(
    { "20260101000000_bare_ine.sql": `create table if not exists products (id uuid);` },
    ({ violations }) => {
      assert.equal(violations.length, 1);
      assert.match(violations[0], /unqualified table "products"/);
    },
  );
});

test("flags a table qualified with a schema outside the known set", () => {
  withFixture(
    { "20260101000000_rogue.sql": `create table public.products (id uuid primary key);` },
    ({ violations }) => {
      assert.equal(violations.length, 1);
      assert.match(violations[0], /unknown schema "public"/);
    },
  );
});

test("recognizes 'create table if not exists' and quoted identifiers", () => {
  withFixture(
    {
      "20260101000000_variants.sql": `
        create table if not exists inventory.stock_movements (id uuid primary key);
        create table "fsm"."jobs" (id uuid primary key);
      `,
    },
    ({ violations }) => {
      assert.equal(violations.length, 1);
      assert.match(violations[0], /inventory, fsm|fsm, inventory/);
    },
  );
});

test("is case-insensitive about DDL keywords", () => {
  withFixture(
    {
      "20260101000000_upper.sql": `
        CREATE TABLE INVENTORY.warehouses (id uuid primary key);
        ALTER TABLE FSM.jobs ADD COLUMN note text;
      `,
    },
    ({ violations }) => assert.equal(violations.length, 1),
  );
});

test("judges each migration file on its own, not the timeline as a whole", () => {
  withFixture(
    {
      "20260101000000_inventory.sql": `create table inventory.warehouses (id uuid primary key);`,
      "20260102000000_fsm.sql": `create table fsm.jobs (id uuid primary key);`,
    },
    ({ violations, checked }) => {
      assert.deepEqual(violations, []);
      assert.equal(checked, 2);
    },
  );
});

test("ignores non-.sql files in the migrations directory", () => {
  withFixture(
    {
      "README.md": `create table inventory.x (id uuid); create table fsm.y (id uuid);`,
      "20260101000000_ok.sql": `create table core.items (id uuid primary key);`,
    },
    ({ violations, checked }) => {
      assert.deepEqual(violations, []);
      assert.equal(checked, 1);
    },
  );
});

test("reports an absent migrations directory as 'missing', not as a violation", () => {
  const root = mkdtempSync(join(tmpdir(), "migration-fixture-empty-"));
  try {
    const result = runMigrationLint(root);
    assert.equal(result.missing, true);
    assert.deepEqual(result.violations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports an empty migrations directory as zero files checked", () => {
  withFixture({}, ({ violations, checked, missing }) => {
    assert.deepEqual(violations, []);
    assert.equal(checked, 0);
    assert.equal(missing, false);
  });
});
