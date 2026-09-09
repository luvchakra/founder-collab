#!/usr/bin/env node
/**
 * Run one module's tests on demand, instead of the full `npm run test:db` chain
 * (docs/testing/TESTING_STRATEGY.md) or the whole workspace's `npm test`. Two layers
 * per module, in this order:
 *   1. Its package-level vitest suite (`npm run test --workspace=<pkg>`) -- fast,
 *      no database involved.
 *   2. Its DB/RLS + workflow scripts (`scripts/test-<module>-*.mjs`), against a
 *      throwaway Postgres database (scripts/lib/rls-test-harness.mjs) -- the same
 *      scripts `npm run test:db` already chains, just scoped to one module.
 *
 * Usage:
 *   node scripts/test-module.mjs <module>
 *   npm run test:module -- <module>
 * where <module> is one of: core, discovery, inventory, fsm, crm, gst, all
 *
 * Stops at the first failing script (matching test:db's own `&&`-chained
 * fail-fast behavior) and exits non-zero, so it's safe to use as a CI/pre-commit gate
 * scoped to just the module you're working on.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

const MODULES = {
  core: {
    pkg: "@cofounderai/core",
    scripts: [
      "test-core-parties-rls.mjs",
      "test-core-addresses-rls.mjs",
      "test-core-items-rls.mjs",
      "test-core-number-sequences.mjs",
      "test-core-documents-rls.mjs",
      "test-core-payments-rls.mjs",
      "test-core-tags-fields-attachments-rls.mjs",
      "test-core-domain-events.mjs",
      "test-core-audit-log.mjs",
      "test-core-api-keys.mjs",
      "test-core-messages-rls.mjs",
      "test-core-ai-usage-rls.mjs",
      "test-core-licensed-modules-by-business.mjs",
      "test-core-license-lifecycle.mjs",
    ],
  },
  discovery: {
    pkg: "@cofounderai/module-discovery",
    scripts: ["test-discovery-rls.mjs", "test-discovery-party-backfill.mjs"],
  },
  inventory: {
    pkg: "@cofounderai/module-inventory",
    scripts: [
      "test-inventory-rls.mjs",
      "test-inventory-procedural.mjs",
      "test-inventory-compat-views.mjs",
      "test-sales-returns-workflow.mjs",
    ],
  },
  fsm: {
    pkg: "@cofounderai/module-fsm",
    scripts: ["test-fsm-rls.mjs", "test-fsm-workflow.mjs"],
  },
  crm: {
    pkg: "@cofounderai/module-crm",
    scripts: ["test-crm-rls.mjs", "test-crm-workflow.mjs"],
  },
  gst: {
    pkg: "@cofounderai/module-gst",
    scripts: [
      "test-gst-credentials-rls.mjs",
      "test-gst-generation-history-rls.mjs",
      "test-gst-filing-workflow.mjs",
    ],
  },
};

function run(cmd, args, label) {
  console.log(`\n--- ${label} ---`);
  const result = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT });
  if (result.status !== 0) {
    console.error(`\nFAILED: ${label}`);
    process.exit(result.status ?? 1);
  }
}

function runModule(key) {
  const module = MODULES[key];
  if (!module) {
    console.error(`Unknown module "${key}". Valid: ${Object.keys(MODULES).join(", ")}, all`);
    process.exit(1);
  }

  console.log(`\n=== ${key} ===`);
  run("npm", ["run", "test", "--workspace", module.pkg], `${key}: package test suite (${module.pkg})`);

  for (const script of module.scripts) {
    const scriptPath = join(ROOT, "scripts", script);
    if (!existsSync(scriptPath)) {
      // A workflow script this module doesn't have yet -- skipped, not a failure, so
      // this dispatcher never blocks on coverage that's still being built out.
      console.log(`\n--- ${key}: ${script} (skipped -- not written yet) ---`);
      continue;
    }
    run("node", [scriptPath], `${key}: ${script}`);
  }

  console.log(`\n=== ${key}: all tests passed ===`);
}

function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error(`Usage: node scripts/test-module.mjs <${Object.keys(MODULES).join("|")}|all>`);
    process.exit(1);
  }

  if (arg === "all") {
    for (const key of Object.keys(MODULES)) runModule(key);
    return;
  }

  runModule(arg);
}

main();
