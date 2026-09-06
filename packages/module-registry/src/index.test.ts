import { describe, expect, it } from "vitest";
import { getModule, moduleRegistry, type ModuleKey } from "./index";

const ALL_KEYS: ModuleKey[] = ["discovery", "inventory", "fsm", "crm", "gst"];

describe("module registry", () => {
  it("declares exactly the 5 platform modules", () => {
    expect(moduleRegistry.map((m) => m.key).sort()).toEqual([...ALL_KEYS].sort());
  });

  it("has no duplicate keys", () => {
    const keys = moduleRegistry.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(ALL_KEYS)("getModule('%s') returns a manifest with at least one nav item", (key) => {
    const module = getModule(key);
    expect(module).toBeDefined();
    expect(module!.nav.length).toBeGreaterThan(0);
    expect(module!.routePrefix.startsWith("/")).toBe(true);
  });

  it("every module declares at least one permission key", () => {
    for (const module of moduleRegistry) {
      expect(module.permissions.length).toBeGreaterThan(0);
    }
  });

  it("optionalPeers never references a module's own key", () => {
    for (const module of moduleRegistry) {
      expect(module.optionalPeers).not.toContain(module.key);
    }
  });
});
