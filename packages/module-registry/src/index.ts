/**
 * Static manifest of the platform's licensable modules (story `P-3`,
 * docs/plan/04-CLAUDE-CODE-BACKLOG.md). `apps/web` builds navigation, routes and
 * dashboards from this registry — never from a hardcoded list (00-MASTER-PLAN.md §6).
 *
 * Each module's own package will eventually own its manifest entry (once
 * `packages/module-<key>` exists, per stories P-5/SP-7/F-1/S-1/S-2); until then the
 * five entries are declared here directly.
 */

export type ModuleKey = "discovery" | "inventory" | "fsm" | "crm" | "gst";

export interface ModuleNavItem {
  label: string;
  href: string;
}

export interface ModuleManifest {
  key: ModuleKey;
  name: string;
  /** lucide-react icon name; resolved to a component where it's rendered, not here. */
  icon: string;
  /** Route segment under apps/web/app/(dashboard)/[businessSlug]/, e.g. "/discovery". */
  routePrefix: string;
  nav: ModuleNavItem[];
  /** Permission keys this module defines, seeded into core.permissions by story C-7. */
  permissions: string[];
  /** Other module keys this module integrates with when both are licensed (soft, per ADR-10). */
  optionalPeers: ModuleKey[];
}

export const moduleRegistry: ModuleManifest[] = [
  {
    key: "discovery",
    name: "Discovery",
    icon: "Target",
    routePrefix: "/discovery",
    nav: [{ label: "Overview", href: "/discovery" }],
    permissions: ["discovery.access"],
    optionalPeers: ["fsm"],
  },
  {
    key: "inventory",
    name: "Inventory",
    icon: "Package",
    routePrefix: "/inventory",
    nav: [{ label: "Overview", href: "/inventory" }],
    permissions: ["inventory.access"],
    optionalPeers: ["fsm", "gst"],
  },
  {
    key: "fsm",
    name: "Service",
    icon: "Wrench",
    routePrefix: "/fsm",
    nav: [{ label: "Overview", href: "/fsm" }],
    permissions: ["fsm.access"],
    optionalPeers: ["discovery", "inventory", "gst", "crm"],
  },
  {
    key: "crm",
    name: "CRM",
    icon: "Inbox",
    routePrefix: "/crm",
    nav: [{ label: "Overview", href: "/crm" }],
    permissions: ["crm.access"],
    optionalPeers: ["discovery", "fsm", "inventory", "gst"],
  },
  {
    key: "gst",
    name: "GST",
    icon: "Receipt",
    routePrefix: "/gst",
    nav: [{ label: "Overview", href: "/gst" }],
    permissions: ["gst.access"],
    optionalPeers: ["inventory", "fsm"],
  },
];

export function getModule(key: ModuleKey): ModuleManifest | undefined {
  return moduleRegistry.find((module) => module.key === key);
}
