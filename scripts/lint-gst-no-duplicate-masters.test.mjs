// COMPLY-P0-03.5's own "deliberately-failing fixture test proving the rule bites"
// (mirroring lint-import-boundaries.test.mjs's convention). Builds a throwaway
// supabase/migrations/ fixture tree per case rather than asserting against the real
// repo, so this test stays meaningful even though the real repo has zero violations.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLint } from "./lint-gst-no-duplicate-masters.mjs";

function makeFixture(migrationFiles) {
  const root = mkdtempSync(join(tmpdir(), "no-duplicate-masters-fixture-"));
  const migrationsDir = join(root, "supabase", "migrations");
  mkdirSync(migrationsDir, { recursive: true });
  for (const [name, content] of Object.entries(migrationFiles)) {
    writeFileSync(join(migrationsDir, name), content);
  }
  return root;
}

test("flags a gst-schema table that re-creates a core-owned customer/party master", () => {
  const root = makeFixture({
    "20990101000000_oops.sql": `create table gst.customers (\n  id uuid primary key\n);\n`,
  });
  try {
    const { violations } = runLint(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /creates "gst\.customers"/);
    assert.match(violations[0], /core-owned master concept/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("flags a gst-schema table that re-creates a core-owned document/invoice master", () => {
  const root = makeFixture({
    "20990101000000_oops.sql": `create table if not exists "gst"."invoices" (\n  id uuid primary key\n);\n`,
  });
  try {
    const { violations } = runLint(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /creates "gst\.invoices"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("allows genuine Compliance-owned tables with no reserved-name collision", () => {
  const root = makeFixture({
    "20260911004100_gst_compliance_profile.sql": `create table gst.compliance_profiles (\n  business_id uuid primary key\n);\n`,
    "20260911004200_gst_tax_registrations.sql": `create table gst.tax_registrations (\n  id uuid primary key\n);\n`,
    "20260911004500_gst_tax_rules.sql": `create table gst.tax_rules (\n  id uuid primary key\n);\n`,
    "20260908120000_gst_generation_history.sql": `create table gst.einvoices (\n  id uuid primary key\n);\ncreate table gst.eway_bills (\n  id uuid primary key\n);\n`,
  });
  try {
    const { violations } = runLint(root);
    assert.deepEqual(violations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not flag a matching reserved name in a different module's own schema", () => {
  // Deliberately out of this guard's scope (see the script's own docstring): this run is
  // restricted to module-gst, and discovery.products is an existing, unrelated, already
  // -decided concept (a GTM offering, not core.items' sellable-SKU master) that a
  // gst-only guard has no mandate to police.
  const root = makeFixture({
    "20260906100000_discovery_schema.sql": `create table discovery.products (\n  id uuid primary key\n);\n`,
  });
  try {
    const { violations } = runLint(root);
    assert.deepEqual(violations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("returns no violations and no crash when supabase/migrations does not exist", () => {
  const root = mkdtempSync(join(tmpdir(), "no-duplicate-masters-empty-"));
  try {
    const { violations, scanned } = runLint(root);
    assert.deepEqual(violations, []);
    assert.equal(scanned, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
