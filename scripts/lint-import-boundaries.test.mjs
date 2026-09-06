// P-4's "deliberately-failing fixture test proving the rule bites"
// (04-CLAUDE-CODE-BACKLOG.md, Epic 1). Builds a throwaway fixture tree under a temp
// directory for each case rather than asserting against the real repo, so this test
// stays meaningful even after every real violation gets fixed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLint } from "./lint-import-boundaries.mjs";

function makeFixture(files) {
  const root = mkdtempSync(join(tmpdir(), "boundary-fixture-"));
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(root, relPath);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}

test("flags a module reaching into another module's internals", () => {
  const root = makeFixture({
    "packages/module-a/src/index.ts": `import { helper } from "@cofounderai/module-b/src/internal";\nexport { helper };\n`,
    "packages/module-b/src/internal.ts": `export const helper = 1;\n`,
  });
  try {
    const { violations } = runLint(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /module-a\/src\/index\.ts/);
    assert.match(violations[0], /only "@cofounderai\/module-b\/contract" is a legal cross-module import/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("flags core importing a module at all", () => {
  const root = makeFixture({
    "packages/core/src/oops.ts": `import { thing } from "@cofounderai/module-fsm/contract";\nexport { thing };\n`,
  });
  try {
    const { violations } = runLint(root);
    assert.equal(violations.length, 1);
    assert.match(violations[0], /"core" may not import module "fsm"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("allows a module's own contract entry point", () => {
  const root = makeFixture({
    "packages/module-a/src/index.ts": `import { reserveStock } from "@cofounderai/module-inventory/contract";\nexport { reserveStock };\n`,
    "packages/module-inventory/src/contract/index.ts": `export const reserveStock = () => {};\n`,
  });
  try {
    const { violations } = runLint(root);
    assert.deepEqual(violations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("allows a module importing its own internals", () => {
  const root = makeFixture({
    "packages/module-a/src/index.ts": `import { helper } from "@cofounderai/module-a/src/internal";\nexport { helper };\n`,
    "packages/module-a/src/internal.ts": `export const helper = 1;\n`,
  });
  try {
    const { violations } = runLint(root);
    assert.deepEqual(violations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not misclassify @cofounderai/module-registry as a business module", () => {
  const root = makeFixture({
    "packages/core/src/nav.ts": `import { moduleRegistry } from "@cofounderai/module-registry";\nexport { moduleRegistry };\n`,
  });
  try {
    const { violations } = runLint(root);
    assert.deepEqual(violations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
