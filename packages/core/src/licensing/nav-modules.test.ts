/**
 * Licensing enforcement layer 4. The distinction that carries the whole behaviour is
 * `null` (no active business — nothing to check against) versus an empty set (a business
 * IS active and has licensed nothing); collapsing the two would either hide every module
 * on /dashboard or advertise every module on a business that owns none.
 */
import { describe, expect, it } from "vitest";
import { moduleRegistry } from "@cofounderai/module-registry";
import { DEFAULT_UPSELL_HREF, buildNavModules, licensedKeysFor } from "./nav-modules";

const MODULES = [
  { key: "discovery", name: "Discovery", icon: "Target", routePrefix: "/discovery" },
  { key: "inventory", name: "Inventory", icon: "Package", routePrefix: "/inventory" },
  { key: "fsm", name: "Service", icon: "Wrench", routePrefix: "/fsm" },
];

describe("buildNavModules", () => {
  it("lists every module, licensed or not — never a shorter list", () => {
    const nav = buildNavModules(MODULES, new Set(["discovery"]));

    expect(nav.map((m) => m.key)).toEqual(["discovery", "inventory", "fsm"]);
  });

  it("marks only the licensed modules as licensed", () => {
    const nav = buildNavModules(MODULES, new Set(["discovery", "fsm"]));

    expect(nav.map((m) => [m.key, m.licensed])).toEqual([
      ["discovery", true],
      ["inventory", false],
      ["fsm", true],
    ]);
  });

  it("points a licensed module at its own route", () => {
    const nav = buildNavModules(MODULES, new Set(["inventory"]));

    expect(nav.find((m) => m.key === "inventory")!.routePrefix).toBe("/inventory");
  });

  it("points an unlicensed module at the licences page, not a route layer 2 would 404", () => {
    const nav = buildNavModules(MODULES, new Set());

    for (const entry of nav) {
      expect(entry.routePrefix).toBe(DEFAULT_UPSELL_HREF);
      expect(entry.licensed).toBe(false);
    }
  });

  it("honours a custom upsell destination", () => {
    const nav = buildNavModules(MODULES, new Set(), { upsellHref: "/pricing" });

    expect(nav[0]!.routePrefix).toBe("/pricing");
  });

  it("treats a null entitlement set as 'no business selected' and links everything normally", () => {
    const nav = buildNavModules(MODULES, null);

    expect(nav.every((m) => m.licensed)).toBe(true);
    expect(nav.map((m) => m.routePrefix)).toEqual(["/discovery", "/inventory", "/fsm"]);
  });

  it("distinguishes an empty set from null — a business owning nothing upsells everything", () => {
    const none = buildNavModules(MODULES, new Set());
    const noBusiness = buildNavModules(MODULES, null);

    expect(none.every((m) => m.licensed === false)).toBe(true);
    expect(noBusiness.every((m) => m.licensed === true)).toBe(true);
  });

  it("rewrites a licensed module's href through businessHref when one is given", () => {
    const nav = buildNavModules(MODULES, new Set(["inventory"]), {
      businessHref: (prefix) => `/dashboard/businesses/biz-1${prefix}`,
    });

    expect(nav.find((m) => m.key === "inventory")!.routePrefix).toBe(
      "/dashboard/businesses/biz-1/inventory",
    );
  });

  it("does not run an unlicensed module's href through businessHref — it stays the upsell", () => {
    const nav = buildNavModules(MODULES, new Set(), {
      businessHref: (prefix) => `/dashboard/businesses/biz-1${prefix}`,
    });

    expect(nav[0]!.routePrefix).toBe(DEFAULT_UPSELL_HREF);
  });

  it("carries name and icon through unchanged", () => {
    const nav = buildNavModules(MODULES, new Set(["discovery"]));

    expect(nav[0]).toMatchObject({ name: "Discovery", icon: "Target" });
  });

  it("returns an empty list for an empty manifest", () => {
    expect(buildNavModules([], new Set())).toEqual([]);
  });

  it("works against the real registry, upselling every module a new business has not bought", () => {
    const nav = buildNavModules(moduleRegistry, new Set(["discovery"]));

    expect(nav).toHaveLength(moduleRegistry.length);
    expect(nav.filter((m) => m.licensed).map((m) => m.key)).toEqual(["discovery"]);
  });
});

describe("licensedKeysFor", () => {
  const map = { "biz-1": ["discovery", "inventory"], "biz-2": [] };

  it("returns the active business's entitlements", () => {
    expect([...licensedKeysFor(map, "biz-1")!]).toEqual(["discovery", "inventory"]);
  });

  it("returns an empty set — not null — for a business that has licensed nothing", () => {
    const keys = licensedKeysFor(map, "biz-2");

    expect(keys).not.toBeNull();
    expect(keys!.size).toBe(0);
  });

  it("returns an empty set for a business absent from the map", () => {
    expect(licensedKeysFor(map, "biz-unknown")!.size).toBe(0);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
  ])("returns null when the active business is %s", (_label, activeBusinessId) => {
    expect(licensedKeysFor(map, activeBusinessId)).toBeNull();
  });
});
