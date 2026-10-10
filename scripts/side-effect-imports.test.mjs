// A bare `import "@cofounderai/<pkg>/<path>"` exists only for its side effect (the drain
// route's event-handler registrations). If the package says `"sideEffects": false`, or its
// list leaves that file out, the production bundler drops the import without a word --
// which is how core's licensing, billing and RBAC handlers went missing on production and
// every event they handle failed as "No handler registered".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield path;
  }
}

function bareImports() {
  const found = [];
  for (const top of ["apps", "packages"]) {
    for (const file of sourceFiles(join(ROOT, top))) {
      for (const match of readFileSync(file, "utf8").matchAll(/^import ["'](@cofounderai\/[^"']+)["'];?$/gm)) {
        found.push({ file: relative(ROOT, file), specifier: match[1] });
      }
    }
  }
  return found;
}

function resolve(specifier) {
  const [, scope, ...rest] = specifier.split("/");
  const pkgDir = join(ROOT, "packages", scope);
  const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
  const subpath = `./${rest.join("/")}`;
  for (const [key, target] of Object.entries(pkg.exports ?? {})) {
    if (key === subpath) return { pkg, target };
    if (key.endsWith("/*") && subpath.startsWith(key.slice(0, -1))) {
      return { pkg, target: target.replace("*", subpath.slice(key.length - 1)) };
    }
  }
  throw new Error(`${specifier} is not exported by ${pkg.name}`);
}

test("the drain route has side-effect imports to check", () => {
  assert.ok(bareImports().some((i) => i.file.includes("drain-events")));
});

test("every side-effect-only import is a file its package declares as having side effects", () => {
  for (const { file, specifier } of bareImports()) {
    const { pkg, target } = resolve(specifier);
    const sideEffects = pkg.sideEffects;
    const kept = sideEffects === undefined || sideEffects === true || (Array.isArray(sideEffects) && sideEffects.includes(target));
    assert.ok(kept, `${file} imports ${specifier} for its side effect, but ${pkg.name}'s "sideEffects" doesn't list ${target}, so the bundler drops it`);
  }
});
