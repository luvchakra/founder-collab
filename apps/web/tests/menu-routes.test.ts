import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { moduleRegistry } from "@cofounderai/module-registry";

// Covers docs/testing/test-cases/menu-smoke.md. Pure filesystem check -- no dev
// server, no auth, no database -- so it runs in every `npm test` pass and fails
// immediately (rather than only when someone happens to click that exact menu item)
// if a route folder or its page.tsx goes missing while the registry still lists it.
// This would have caught both fsm gaps this file documents as known-failing.

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

// Known-failing at the time this test was written -- see menu-smoke.md TC-MENU-FSM-001
// and TC-MENU-FSM-007. Remove an entry here the same commit its route is fixed, so
// this test starts asserting it like every other item instead of skipping it forever.
const KNOWN_FAILING = new Set([
  "fsm::", // Dashboard (root) -- apps/web/.../fsm/page.tsx does not exist
  "fsm::customers", // Customers -- apps/web/.../fsm/customers/ does not exist at all
]);

describe("every module-registry nav item resolves to a real page", () => {
  for (const module of moduleRegistry) {
    // discovery's real nav is dynamic (product list), not this static registry entry
    // (see the registry's own comment on the discovery entry) -- skip it here.
    if (module.key === "discovery") continue;

    const prefix = module.routePrefix.replace(/^\//, "");

    for (const group of module.nav) {
      for (const item of group.items) {
        const routeKey = `${module.key}::${item.slug}`;
        const testName = `${module.name} \u2192 "${item.label}" (/${prefix}${
          item.slug ? `/${item.slug}` : ""
        })`;

        if (KNOWN_FAILING.has(routeKey)) {
          it.fails(`${testName} [known-failing, tracked in menu-smoke.md]`, () => {
            const pagePath = join(BUSINESS_ROUTE_ROOT, prefix, item.slug, "page.tsx");
            expect(existsSync(pagePath)).toBe(true);
          });
          continue;
        }

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
