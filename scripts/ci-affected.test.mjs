import { test } from "node:test";
import assert from "node:assert/strict";
import { selectAffected } from "./ci-affected.mjs";

const DB = [
  "test-core-parties-rls.mjs",
  "test-crm-rls.mjs",
  "test-finance-fixtures.mjs",
  "test-fsm-rls.mjs",
  "test-gst-credentials-rls.mjs",
  "test-inventory-rls.mjs",
  "test-sales-returns-workflow.mjs",
  "test-views-security-invoker.mjs",
];
const select = (files) => selectAffected(files, DB);

test("docs-only changes skip typecheck, lint, unit tests, build and DB tests", () => {
  assert.deepEqual(select(["docs/plan/04-CLAUDE-CODE-BACKLOG.md", "CLAUDE.md"]), {
    code: false,
    unit: "changed",
    build: false,
    db: "",
  });
});

test("app code runs affected unit tests and the build, but no DB tests", () => {
  assert.deepEqual(select(["packages/module-fsm/src/lib/jobs.ts"]), {
    code: true,
    unit: "changed",
    build: true,
    db: "",
  });
});

test("a module migration runs that module's DB tests plus the views check", () => {
  assert.equal(select(["supabase/migrations/20261001000000_fsm_job_notes.sql"]).db, "test-fsm-rls.mjs test-views-security-invoker.mjs");
  assert.equal(
    select(["supabase/migrations/20261001000000_gst_rules.sql"]).db,
    "test-finance-fixtures.mjs test-gst-credentials-rls.mjs test-views-security-invoker.mjs",
  );
  assert.equal(
    select(["supabase/migrations/20261001000000_inventory_bins.sql"]).db,
    "test-inventory-rls.mjs test-sales-returns-workflow.mjs test-views-security-invoker.mjs",
  );
});

test("migrations don't trigger a build: the deployed app isn't built from them", () => {
  assert.equal(select(["supabase/migrations/20261001000000_crm_x.sql"]).build, false);
});

test("a core or unrecognised migration runs every DB test", () => {
  assert.equal(select(["supabase/migrations/20261001000000_core_parties.sql"]).db, "all");
  assert.equal(select(["supabase/migrations/20261001000000_harden_grants.sql"]).db, "all");
});

test("an edited DB test script runs just that script", () => {
  assert.equal(select(["scripts/test-crm-rls.mjs"]).db, "test-crm-rls.mjs");
});

test("dependency and tooling changes run every unit test", () => {
  assert.equal(select(["package-lock.json"]).unit, "all");
  assert.equal(select(["apps/web/vitest.config.ts"]).unit, "all");
  assert.equal(select(["packages/core/tsconfig.json"]).unit, "all");
});

test("changing CI itself runs everything", () => {
  const full = { code: true, unit: "all", build: true, db: "all" };
  assert.deepEqual(select([".github/workflows/ci.yml"]), full);
  assert.deepEqual(select(["scripts/lib/rls-test-harness.mjs"]), full);
  assert.deepEqual(select(["supabase/tests/local-stub.sql"]), full);
});
