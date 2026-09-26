// EXP-ADMIN-06 -- Configuration history export.
import {
  CONFIG_RESOURCE_TYPES,
  listConfigResourceInstances,
  listConfigVersions,
  type ConfigResourceType,
} from "@cofounderai/core/admin/config-history";
import type { PlatformExportAdapter } from "@cofounderai/core/exports/platform";

type Row = {
  configuration: string;
  instance: string;
  version: number;
  action: string;
  current: boolean;
  rollback: boolean;
  performedAt: string;
  performedBy: string | null;
  reason: string;
};

const ACTION_LABEL: Record<string, string> = { created: "Created", updated: "Updated", deleted: "Deleted", status_changed: "Status changed" };
const TYPES = new Set<string>(CONFIG_RESOURCE_TYPES.map((t) => t.key));

/**
 * Every configuration's version history -- or one configuration type, when the page has
 * one selected -- as version, action, whether it is the current version, whether it can
 * be rolled back to, when, by whom and why. Never the before/after values themselves:
 * AI provider, email provider and integration history can hold configuration a file
 * must not carry (§30, "exclude secret values").
 */
export const platformConfigHistoryExport: PlatformExportAdapter<{ type: ConfigResourceType | null }> = {
  id: "platform.config-history",
  parseFilters: (params) => ({ type: TYPES.has(params.get("type") ?? "") ? (params.get("type") as ConfigResourceType) : null }),
  describeFilters: (f) => ({ Configuration: f.type ? (CONFIG_RESOURCE_TYPES.find((t) => t.key === f.type)?.label ?? f.type) : "" }),
  async load(_context, filters) {
    const types = CONFIG_RESOURCE_TYPES.filter((t) => !filters.type || t.key === filters.type);
    const rows: Row[] = (
      await Promise.all(
        types.map(async (type) => {
          const [instances, versions] = await Promise.all([listConfigResourceInstances(type.key), listConfigVersions(type.key, null)]);
          const instanceLabel = new Map(instances.map((i) => [i.id, i.label]));
          return versions.map((v) => ({
            configuration: type.label,
            instance: v.instanceId ? (instanceLabel.get(v.instanceId) ?? v.instanceId) : type.singleton ? "Platform-wide" : "",
            version: v.version,
            action: ACTION_LABEL[v.action] ?? v.action,
            current: v.isCurrent,
            rollback: type.restorable,
            performedAt: v.performedAt,
            performedBy: v.performedBy,
            reason: v.reason,
          }));
        }),
      )
    ).flat();
    return {
      module: "platform",
      resource: "config-history",
      title: "Configuration history",
      sheets: [
        {
          sheetName: "Config history",
          columns: [
            { key: "configuration", header: "Configuration", getValue: (r: Row) => r.configuration },
            { key: "instance", header: "Instance", getValue: (r: Row) => r.instance },
            { key: "version", header: "Version", type: "integer", getValue: (r: Row) => r.version },
            { key: "action", header: "Action", getValue: (r: Row) => r.action },
            { key: "current", header: "Current version", type: "boolean", getValue: (r: Row) => r.current },
            { key: "rollback", header: "Rollback available", type: "boolean", getValue: (r: Row) => r.rollback },
            { key: "performedAt", header: "Published", type: "datetime", getValue: (r: Row) => r.performedAt },
            { key: "performedBy", header: "Published by", getValue: (r: Row) => r.performedBy },
            { key: "reason", header: "Reason", getValue: (r: Row) => r.reason },
          ],
          rows: rows,
        },
      ],
    };
  },
};
