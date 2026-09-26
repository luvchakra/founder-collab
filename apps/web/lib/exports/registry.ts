import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { PlatformExportAdapter } from "@cofounderai/core/exports/platform";
import { CRM_EXPORTS } from "@cofounderai/module-crm/exports";
import { DISCOVERY_EXPORTS } from "@cofounderai/module-discovery/exports";
import { FSM_EXPORTS } from "@cofounderai/module-fsm/exports";
import { FINANCE_EXPORTS } from "@cofounderai/module-gst/exports";
import { INVENTORY_EXPORTS } from "@cofounderai/module-inventory/exports";
import { PLATFORM_EXPORTS } from "./platform";

/**
 * Every export the platform offers, by the id its Export button asks for
 * (`<module>.<resource>`). Modules own their adapters, each in its own package's
 * src/exports folder; this host only maps ids to them, so /api/exports/[exportId] can
 * never be asked to run something that isn't listed here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each adapter has its own filter type
type AnyAdapter = ExportAdapter<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each adapter has its own filter type
type AnyPlatformAdapter = PlatformExportAdapter<any>;

function byId<T extends { id: string }>(adapters: T[]): Record<string, T> {
  const map: Record<string, T> = {};
  for (const adapter of adapters) {
    if (map[adapter.id]) throw new Error(`Duplicate export id: ${adapter.id}`);
    map[adapter.id] = adapter;
  }
  return map;
}

export const EXPORT_ADAPTERS: Record<string, AnyAdapter> = byId([
  ...DISCOVERY_EXPORTS,
  ...CRM_EXPORTS,
  ...INVENTORY_EXPORTS,
  ...FSM_EXPORTS,
  ...FINANCE_EXPORTS,
]);

export const PLATFORM_EXPORT_ADAPTERS: Record<string, AnyPlatformAdapter> = byId(PLATFORM_EXPORTS);
