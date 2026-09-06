#!/usr/bin/env node
/**
 * Enforces 00-MASTER-PLAN.md §6's module boundary rule without adding a new
 * ESLint plugin dependency (CLAUDE.md principle #2): a `module-*` package may
 * import `@cofounderai/core` and other modules' `contract/index.ts` only —
 * never another module's internals. `core` and `module-registry` may not
 * import any module at all. Violating this fails CI, not a warning
 * (04-CLAUDE-CODE-BACKLOG.md, Epic 1 house rules).
 *
 * `runLint(root)` is exported so lint-import-boundaries.test.mjs can prove the rule
 * actually bites against a fixture tree (P-4's "deliberately-failing fixture test"),
 * not just that it passes on the real repo.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const DEFAULT_ROOT = new URL("..", import.meta.url).pathname;
const SCAN_DIRS = ["apps", "packages"];
const IGNORED = new Set(["node_modules", ".next", "dist", "build"]);
const IMPORT_RE = /(?:from|require\()\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORED.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function ownerOf(root, fileAbsPath) {
  const rel = relative(root, fileAbsPath).split(sep);
  if (rel[0] === "apps") return { kind: "app", name: rel[1] };
  if (rel[0] === "packages" && rel[1] === "core") return { kind: "core", name: "core" };
  if (rel[0] === "packages" && rel[1] === "module-registry") {
    return { kind: "registry", name: "module-registry" };
  }
  if (rel[0] === "packages" && rel[1]?.startsWith("module-")) {
    return { kind: "module", name: rel[1].slice("module-".length) };
  }
  return { kind: "other", name: rel.join("/") };
}

function checkSpecifier(root, owner, specifier, file, violations) {
  if (specifier === "@cofounderai/module-registry" || specifier.startsWith("@cofounderai/module-registry/")) {
    return; // the registry package, not a business module -- see ownerOf()'s own "registry" kind
  }
  const match = specifier.match(/^@cofounderai\/module-([^/]+)(\/.*)?$/);
  if (!match) return;
  const [, targetModule, subpath = ""] = match;

  if (owner.kind === "module" && owner.name === targetModule) return; // self-import, fine

  if (owner.kind === "core" || owner.kind === "registry") {
    violations.push(
      `${relative(root, file)}: "${owner.name}" may not import module "${targetModule}" (${specifier}) — core/module-registry must not depend on any module.`,
    );
    return;
  }

  const isContractEntry = subpath === "" || subpath === "/contract" || subpath.startsWith("/contract/");
  if (!isContractEntry) {
    violations.push(
      `${relative(root, file)}: imports "${specifier}" — only "@cofounderai/module-${targetModule}/contract" is a legal cross-module import (00-MASTER-PLAN.md §6).`,
    );
  }
}

export function runLint(root) {
  const violations = [];
  let scanned = 0;

  for (const dir of SCAN_DIRS) {
    const abs = join(root, dir);
    let files;
    try {
      files = walk(abs);
    } catch {
      continue; // directory doesn't exist yet
    }
    for (const file of files) {
      scanned += 1;
      const owner = ownerOf(root, file);
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(IMPORT_RE)) {
        const specifier = m[1] ?? m[2];
        if (specifier) checkSpecifier(root, owner, specifier, file, violations);
      }
    }
  }

  return { violations, scanned };
}

function main() {
  const { violations, scanned } = runLint(DEFAULT_ROOT);

  if (violations.length > 0) {
    console.error(`Import boundary violations (${violations.length}):\n`);
    for (const v of violations) console.error(`  - ${v}`);
    console.error("");
    process.exit(1);
  }

  console.log(`lint:boundaries — ${scanned} files scanned, no violations.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
