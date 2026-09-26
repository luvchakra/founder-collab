// EXP-FIN-17 (Audit) -- Finance audit log export (/finance/audit-log).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { AuditLogEntry } from "@cofounderai/core/audit/types";
import { listAuditActors } from "@cofounderai/core/audit/queries";
import { ACTION_LABEL, ENTITY_TYPE_LABEL, describeAuditChange } from "@cofounderai/core/audit/format";
import { listAuditLogForExport, type AuditLogFilters } from "./queries";
import { FINANCE_FILE_MODULE, FINANCE_LICENCE, FINANCE_READ_PERMISSIONS } from "./shared";

/**
 * The page's own filters -- `entityType`, `actorId`, `dateFrom`, `dateTo`, passed through
 * exactly as the page passes them -- over the same `core.audit_log` rows. The page shows
 * the newest 200 and does not paginate; the export is every matching record
 * (`listAuditLogForExport`, the same predicates, paged).
 *
 * Each row is what the page's table shows: when, who (by name), the entity and action by
 * label, and the page's own one-line description of the change. The raw before/after
 * snapshots are never written -- they can hold whatever a changed row held. The page reads
 * with no permission check.
 */
export const financeAuditLogExport: ExportAdapter<AuditLogFilters> = {
  id: "finance.audit-log",
  module: FINANCE_LICENCE,
  permissions: FINANCE_READ_PERMISSIONS,
  parseFilters: (params) => ({
    entityType: params.get("entityType") ?? "",
    actorId: params.get("actorId") ?? "",
    dateFrom: params.get("dateFrom") ?? "",
    dateTo: params.get("dateTo") ?? "",
  }),
  describeFilters: (f) => ({
    Entity: f.entityType ? ENTITY_TYPE_LABEL[f.entityType] ?? f.entityType : "",
    Actor: f.actorId,
    From: f.dateFrom,
    To: f.dateTo,
  }),
  async load(context, filters) {
    const [entries, actors] = await Promise.all([
      listAuditLogForExport(context.businessId, filters),
      listAuditActors(context.businessId),
    ]);
    const nameOf = new Map(actors.map((a) => [a.id, a.name]));

    return {
      module: FINANCE_FILE_MODULE,
      resource: "audit-log",
      title: "Finance audit log",
      sheets: [
        {
          sheetName: "Audit log",
          rows: entries,
          columns: [
            { key: "when", header: "When", type: "datetime", getValue: (r: AuditLogEntry) => r.created_at },
            {
              key: "actor",
              header: "Actor",
              getValue: (r: AuditLogEntry) => (r.actor_id ? nameOf.get(r.actor_id) ?? r.actor_id : "System"),
            },
            { key: "entity", header: "Entity", getValue: (r: AuditLogEntry) => ENTITY_TYPE_LABEL[r.entity_type] ?? r.entity_type },
            { key: "entity_id", header: "Entity id", getValue: (r: AuditLogEntry) => r.entity_id },
            { key: "action", header: "Action", getValue: (r: AuditLogEntry) => ACTION_LABEL[r.action] ?? r.action },
            { key: "details", header: "Details", getValue: (r: AuditLogEntry) => describeAuditChange(r) },
          ],
        },
      ],
    };
  },
};
