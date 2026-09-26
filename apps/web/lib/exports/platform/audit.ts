// EXP-ADMIN-01 -- Platform Audit export.
import { searchPlatformAuditLog } from "@cofounderai/core/admin/platform-audit-log";
import {
  AUDIT_RESOURCE_TYPE_OPTIONS,
  type AuditLogEntry,
  type AuditLogFilters,
  type AuditResourceType,
  type AuditSeverity,
} from "@cofounderai/core/admin/platform-audit-log-types";
import type { PlatformExportAdapter } from "@cofounderai/core/exports/platform";

/** The page shows the newest 100 events; "all matching" widens that to this many --
 * searchPlatformAuditLog merges every resource type's history in memory, so it takes a
 * cap rather than paging. The cap is written into the file when it is hit. */
export const AUDIT_EXPORT_MAX = 10_000;
const PAGE_SIZE = 100;

const ACTION_LABEL: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
  exported: "Exported",
  status_changed: "Status changed",
};
const RESOURCE_TYPES = new Set<string>(AUDIT_RESOURCE_TYPE_OPTIONS.map((option) => option.key));
/** The page sends ISO timestamps (start/end of the chosen day); a bare date is widened the
 * same way. Anything unparseable is dropped rather than trusted. */
function boundary(value: string | null, edge: "start" | "end"): string | undefined {
  if (!value) return undefined;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}${edge === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z"}` : value;
  return Number.isNaN(Date.parse(iso)) ? undefined : new Date(iso).toISOString();
}

/**
 * Exactly the Audit Search page's filters (date range, actor, resource type, action,
 * severity), taken from the export request the page's own filter state builds. Only
 * the summary columns are exported: an event's before/after snapshot can carry
 * configuration values (provider settings, integration config), so it never leaves the
 * page (§18, §30 "never export secret values").
 */
export const platformAuditExport: PlatformExportAdapter<AuditLogFilters> = {
  id: "platform.audit",
  parseFilters: (params) => ({
    dateFrom: boundary(params.get("dateFrom"), "start"),
    dateTo: boundary(params.get("dateTo"), "end"),
    actorId: params.get("actorId") || undefined,
    resourceType: RESOURCE_TYPES.has(params.get("resourceType") ?? "") ? (params.get("resourceType") as AuditResourceType) : undefined,
    action: params.get("action") || undefined,
    severity: params.get("severity") === "high" || params.get("severity") === "normal" ? (params.get("severity") as AuditSeverity) : undefined,
  }),
  describeFilters: (f) => ({
    From: f.dateFrom?.slice(0, 10) ?? "",
    To: f.dateTo?.slice(0, 10) ?? "",
    "Resource type": f.resourceType ? (AUDIT_RESOURCE_TYPE_OPTIONS.find((o) => o.key === f.resourceType)?.label ?? f.resourceType) : "",
    Action: f.action ? (ACTION_LABEL[f.action] ?? f.action) : "",
    Severity: f.severity === "high" ? "High" : f.severity === "normal" ? "Normal" : "",
    Actor: f.actorId ? "Selected actor" : "",
  }),
  async load(context, filters) {
    const limit = context.scope === "all" ? AUDIT_EXPORT_MAX : PAGE_SIZE;
    const entries = await searchPlatformAuditLog(filters, limit);
    return {
      module: "platform",
      resource: "audit",
      title: "Platform audit log",
      metadata: entries.length >= limit ? { Note: `Limited to the newest ${limit.toLocaleString("en-IN")} matching events.` } : undefined,
      sheets: [
        {
          sheetName: "Audit",
          columns: [
            { key: "performedAt", header: "Performed at", type: "datetime", getValue: (e: AuditLogEntry) => e.performedAt },
            { key: "performedBy", header: "Performed by", getValue: (e: AuditLogEntry) => e.performedByLabel },
            { key: "action", header: "Action", getValue: (e: AuditLogEntry) => ACTION_LABEL[e.action] ?? e.action },
            { key: "resourceType", header: "Resource type", getValue: (e: AuditLogEntry) => AUDIT_RESOURCE_TYPE_OPTIONS.find((o) => o.key === e.resourceType)?.label ?? e.resourceType },
            { key: "resource", header: "Resource", getValue: (e: AuditLogEntry) => e.resourceLabel },
            { key: "resourceId", header: "Resource ID", getValue: (e: AuditLogEntry) => e.resourceId },
            { key: "severity", header: "Risk level", getValue: (e: AuditLogEntry) => (e.severity === "high" ? "High" : "Normal") },
            { key: "reason", header: "Reason", getValue: (e: AuditLogEntry) => e.reason },
          ],
          rows: entries,
        },
      ],
    };
  },
};
