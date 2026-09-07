import type { ModuleManifest } from "@cofounderai/module-registry";

/**
 * module-inventory's own self-description (SP-9; repo-structure convention in the root
 * CLAUDE.md: "packages/module-<key>/src/manifest.ts"). Mirrors the "inventory" entry
 * `packages/module-registry/src/index.ts` currently declares by hand -- that file's own
 * docstring says each module will eventually own its manifest entry once its package
 * exists (it now does), but folding this into the static registry array is a separate,
 * broader change than SP-9's own scope ("Manifest, contract/index.ts, event
 * publish/subscribe wiring"), so `moduleRegistry` isn't touched here.
 */
export const inventoryManifest: ModuleManifest = {
  key: "inventory",
  name: "Inventory",
  icon: "Package",
  routePrefix: "/inventory",
  nav: [{ label: "Overview", href: "/inventory" }],
  permissions: ["inventory.access"],
  optionalPeers: ["fsm", "gst"],
};
