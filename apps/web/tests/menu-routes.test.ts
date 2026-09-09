import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { moduleRegistry } from "@cofounderai/module-registry";

// Covers docs/testing/test-cases/menu-smoke.md. Pure filesystem check -- no dev
// server, no auth, no database -- so it runs in every `npm test` pass and fails
// immediately (rather than only when someone happens to click that exact menu item)
// if a route folder or its page.tsx goes missing while the registry still lists it.
// The two fsm gaps this file used to document as known-failing (root "Dashboard" and
// "Customers") were fixed 2026-09-08 -- see menu-smoke.md TC-MENU-FSM-001/002 -- so
// every item now asserts for real; no KNOWN_FAILING set is needed until the next gap.

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUSINESS_ROUTE_ROOT = join(
  __dirname,
  "..",
  "app",
  "(dashboard)",
  "dashboard",
  "businesses",
  "[businessId]",
);

describe("every module-registry nav item resolves to a real page", () => {
  for (const mod of moduleRegistry) {
    // discovery's real nav is dynamic (product list), not this static registry entry
    // (see the registry's own comment on the discovery entry) -- skip it here.
    if (mod.key === "discovery") continue;

    const prefix = mod.routePrefix.replace(/^\//, "");

    for (const group of mod.nav) {
      for (const item of group.items) {
        const testName = `${mod.name} \u2192 "${item.label}" (/${prefix}${
          item.slug ? `/${item.slug}` : ""
        })`;

        it(testName, () => {
          const pagePath = join(BUSINESS_ROUTE_ROOT, prefix, item.slug, "page.tsx");
          expect(
            existsSync(pagePath),
            `Expected a page at ${pagePath} for registry item "${item.label}"`,
          ).toBe(true);
        });
      }
    }
  }
});
