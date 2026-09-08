import type { ModuleManifest } from "@cofounderai/module-registry";

/**
 * module-fsm's own self-description (F-1; repo-structure convention in the root
 * CLAUDE.md: "packages/module-<key>/src/manifest.ts"). Mirrors the "fsm" entry
 * `packages/module-registry/src/index.ts` declares by hand -- that entry's own
 * `name: "Service"` is what puts every FSM screen under one "Service" module menu in
 * the platform nav (per this story's own explicit requirement), not a top-level "FSM"
 * label. `moduleRegistry` can't import this file back (lint:boundaries: core/
 * module-registry may not depend on any module), so the two stay hand-kept in sync
 * rather than one importing the other.
 */
export const fsmManifest: ModuleManifest = {
  key: "fsm",
  name: "Service",
  icon: "Wrench",
  routePrefix: "/fsm",
  nav: [
    { heading: "Overview", items: [{ label: "Dashboard", slug: "", icon: "LayoutDashboard" }] },
    {
      heading: "Pipeline",
      items: [
        { label: "Opportunities", slug: "opportunities", icon: "Target" },
        { label: "Jobs", slug: "jobs", icon: "Briefcase" },
      ],
    },
    {
      heading: "Scheduling",
      items: [
        { label: "Schedule", slug: "schedule", icon: "CalendarDays" },
        { label: "My Day", slug: "my-day", icon: "Smartphone" },
      ],
    },
    { heading: "Billing", items: [{ label: "Invoices", slug: "invoices", icon: "FileText" }] },
    { heading: "Customers", items: [{ label: "Customers", slug: "customers", icon: "Users" }] },
    { heading: "Reports", items: [{ label: "Reports", slug: "reports", icon: "BarChart3" }] },
    { heading: "Administration", items: [{ label: "Settings", slug: "settings", icon: "Settings" }] },
  ],
  permissions: ["fsm.access"],
  optionalPeers: ["discovery", "inventory", "gst", "crm"],
};
