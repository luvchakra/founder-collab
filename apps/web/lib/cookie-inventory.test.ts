import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COOKIE_INVENTORY, consentBannerRequired } from "./cookie-inventory";

/**
 * PLATFORM-P1-09.2: the cookie list is only worth something if it's complete. This scans the
 * app and packages for every cookie or storage name set from a literal or a *_STORAGE_KEY /
 * *_COOKIE_NAME constant, and fails when one isn't in COOKIE_INVENTORY. Supabase's own auth
 * cookies are named at runtime and covered by the "sb-…-auth-token" entry.
 */
const ROOT = join(__dirname, "..", "..", "..");
const SCAN = ["apps/web/app", "apps/web/components", "apps/web/lib", "packages"];
const SKIP = new Set(["node_modules", ".next", "e2e", "dist"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const PATTERNS = [
  /[A-Z_]*(?:STORAGE_KEY|COOKIE_NAME)\s*=\s*"([^"]+)"/g,
  /cookies\.set\(\s*"([^"]+)"/g,
  /(?:localStorage|sessionStorage)\.setItem\(\s*"([^"]+)"/g,
  /document\.cookie\s*=\s*`([A-Za-z0-9_:.-]+)=/g,
];

describe("COOKIE_INVENTORY", () => {
  it("lists every cookie and storage name the code sets", () => {
    const found = new Set<string>();
    for (const dir of SCAN) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        const text = readFileSync(file, "utf8");
        for (const pattern of PATTERNS) for (const m of text.matchAll(pattern)) found.add(m[1]!);
      }
    }
    const listed = new Set(COOKIE_INVENTORY.map((i) => i.name));
    const missing = [...found].filter((name) => !listed.has(name));
    expect(missing, "add these to apps/web/lib/cookie-inventory.ts with a category").toEqual([]);
    expect(found.size).toBeGreaterThan(5);
  });

  it("needs no consent banner while everything is essential or a preference", () => {
    expect(consentBannerRequired()).toBe(false);
    expect(consentBannerRequired([{ name: "_ga", kind: "cookie", category: "analytics", purpose: "x", lifetime: "x" }])).toBe(true);
  });
});
