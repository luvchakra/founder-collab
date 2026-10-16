import { test } from "node:test";
import assert from "node:assert/strict";
import { selectAffected } from "./ci-affected.mjs";
import { lintTargets } from "./lint-changed.mjs";

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
const select = (files, event) => selectAffected(files, DB, { event });
const FULL = { code: true, unit: "all", lint: "all", build: true, db: "all" };

test("docs-only changes skip typecheck, lint, unit tests, build and DB tests", () => {
  assert.deepEqual(select(["docs/plan/04-CLAUDE-CODE-BACKLOG.md", "CLAUDE.md"]), {
    code: false,
    unit: "changed",
    lint: "changed",
    build: false,
    db: "",
  });
});

test("app code runs related unit tests, a changed-files lint and the build, but no DB tests", () => {
  assert.deepEqual(select(["packages/module-fsm/src/lib/jobs.ts"]), {
    code: true,
    unit: "changed",
    lint: "changed",
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

test("dependency, TypeScript, test, lint and build config run every unit test and the whole lint", () => {
  for (const file of [
    "package.json",
    "package-lock.json",
    "packages/core/package.json",
    "packages/core/tsconfig.json",
    "apps/web/vitest.config.ts",
    "apps/web/eslint.config.mjs",
    "apps/web/next.config.ts",
    "apps/web/postcss.config.mjs",
    "apps/web/playwright.config.ts",
  ]) {
    const result = select([file]);
    assert.equal(result.unit, "all", file);
    assert.equal(result.lint, "all", file);
  }
});

test("changing CI itself runs every unit test, the whole lint, every DB test and the build", () => {
  assert.deepEqual(select([".github/workflows/ci.yml"]), FULL);
  assert.deepEqual(select([".github/workflows/e2e-nightly.yml"]), FULL);
  assert.deepEqual(select(["scripts/lint-changed.mjs"]), FULL);
  assert.deepEqual(select(["scripts/lib/rls-test-harness.mjs"]), FULL);
  assert.deepEqual(select(["supabase/tests/local-stub.sql"]), FULL);
});

test("a merge to main runs every unit test and the whole lint, and stays affected-only otherwise", () => {
  assert.deepEqual(select(["packages/module-fsm/src/lib/jobs.ts"], "push"), {
    code: true,
    unit: "all",
    lint: "all",
    build: true,
    db: "",
  });
  assert.equal(select(["docs/x.md"], "push").code, false);
});

test("nothing selects end-to-end tests: they run nightly", () => {
  for (const files of [["packages/core/src/x.ts"], [".github/workflows/ci.yml"], ["apps/web/e2e/security/storage.spec.ts"]]) {
    assert.equal("e2e" in select(files), false);
  }
});

test("the changed-files lint looks only at present JS/TS files under apps/web", () => {
  const present = new Set(["apps/web/app/page.tsx", "apps/web/lib/x.ts", "apps/web/e2e/a.spec.ts", "apps/web/eslint.config.mjs"]);
  assert.deepEqual(
    lintTargets(
      ["apps/web/app/page.tsx", "apps/web/lib/x.ts", "apps/web/e2e/a.spec.ts", "apps/web/eslint.config.mjs", "apps/web/app/gone.ts", "apps/web/app/page.css", "packages/core/src/x.ts", "scripts/x.mjs"],
      (file) => present.has(file),
    ),
    ["app/page.tsx", "lib/x.ts", "e2e/a.spec.ts", "eslint.config.mjs"],
  );
});
