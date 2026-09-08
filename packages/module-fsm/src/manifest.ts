import type { ModuleManifest } from "@cofounderai/module-registry";

/**
 * module-fsm's own self-description (F-1; repo-structure convention in the root
 * CLAUDE.md: "packages/module-<key>/src/manifest.ts"). Mirrors the "fsm" entry
 * `packages/module-registry/src/index.ts` already declares by hand -- that entry's own
 * `name: "Service"` is what puts every FSM screen under one "Service" module menu in
 * the platform nav (per this story's own explicit requirement), not a top-level "FSM"
 * label. As with module-inventory's own manifest.ts (SP-9), folding this into the
 * static registry array is a separate, broader change than this story's scope.
 */
export const fsmManifest: ModuleManifest = {
  key: "fsm",
  name: "Service",
  icon: "Wrench",
  routePrefix: "/fsm",
  nav: [{ label: "Overview", href: "/fsm" }],
  permissions: ["fsm.access"],
  optionalPeers: ["discovery", "inventory", "gst", "crm"],
};
