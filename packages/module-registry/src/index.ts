/**
 * Static manifest of the platform's licensable modules. Populated in story `P-3`
 * (see docs/plan/04-CLAUDE-CODE-BACKLOG.md) once each module package exists.
 * `apps/web` builds navigation, routes and dashboards from this registry — never
 * from a hardcoded list (00-MASTER-PLAN.md §6).
 */

export type ModuleKey = "discovery" | "inventory" | "fsm" | "crm" | "gst";

export interface ModuleNavItem {
  label: string;
  href: string;
  icon?: string;
}

export interface ModuleManifest {
  key: ModuleKey;
  name: string;
  icon: string;
  routePrefix: string;
  nav: ModuleNavItem[];
  /** Other module keys this module integrates with when both are licensed (soft, per ADR-10). */
  optionalPeers: ModuleKey[];
}

export const moduleRegistry: ModuleManifest[] = [];

export function getModule(key: ModuleKey): ModuleManifest | undefined {
  return moduleRegistry.find((module) => module.key === key);
}
