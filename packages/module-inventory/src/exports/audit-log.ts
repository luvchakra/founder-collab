// EXP-INV-12 -- Inventory audit log export (/inventory/audit-log).
import { ACTION_LABEL, ENTITY_TYPE_LABEL } from "@cofounderai/core/audit/format";
import { listAuditActors, listAuditLogForBusiness } from "@cofounderai/core/audit/queries";
import type { AuditLogEntry } from "@cofounderai/core/audit/types";
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { listAuditLogForExport, type AuditLogFilters } from "./queries";
import { INVENTORY_EXPORT_PERMISSIONS, humanize } from "./shared";

type Filters = { entityType: string; actorId: string; dateFrom: string; dateTo: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Keys whose values are never written, only that they changed. */
const SENSITIVE_KEY = /(secret|token|password|passwd|credential|api[_-]?key|private|signature|auth|cookie|session|url|encrypt|iv$|salt)/i;
/** Values that look like opaque keys/tokens are never written either. */
const OPAQUE_VALUE = /^[A-Za-z0-9_\-.+/=]{32,}$/;
const MAX_VALUE_LENGTH = 80;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeValue(key: string, value: unknown): string | null {
  if (SENSITIVE_KEY.test(key)) return null;
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value !== "string") return null; // objects/arrays: summarized as "changed"
  if (value.length > MAX_VALUE_LENGTH || OPAQUE_VALUE.test(value)) return null;
  return value;
}

/**
 * A one-line summary of an audit entry's before/after -- never the raw snapshots, which
 * are arbitrary JSON a trigger or module wrote and could hold anything. Field names are
 * listed; a value is shown only when it is a short plain scalar under a key that isn't
 * secret-like (`status: draft -> approved`), otherwise the field reads "changed".
 */
export function summarizeAuditChange(entry: Pick<AuditLogEntry, "before" | "after">): string {
  const after = isPlainObject(entry.after) ? entry.after : null;
  const before = isPlainObject(entry.before) ? entry.before : null;
  if (!after) return "";
  const keys = before
    ? Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]))
    : Object.keys(after).filter((k) => after[k] !== null && after[k] !== undefined && after[k] !== "");
  return keys
    .map((key) => {
      const next = safeValue(key, after[key]);
      if (!before) return next === null ? `${key} recorded` : `${key}: ${next}`;
      const prev = safeValue(key, before[key]);
      return next === null || prev === null ? `${key} changed` : `${key}: ${prev} -> ${next}`;
    })
    .join(", ");
}

export function parseAuditFilters(params: URLSearchParams): Filters {
  const dateFrom = params.get("dateFrom") ?? "";
  const dateTo = params.get("dateTo") ?? "";
  return {
    entityType: params.get("entityType") ?? "",
    actorId: params.get("actorId") ?? "",
    dateFrom: DATE.test(dateFrom) ? dateFrom : "",
    dateTo: DATE.test(dateTo) ? dateTo : "",
  };
}

/**
 * The page's filters (entity type, actor, date range) applied the page's way. The page
 * shows the newest 200 entries: "current view" is exactly those (its own loader),
 * "all matching records" is every entry under the same filters.
 */
export const inventoryAuditLogExport: ExportAdapter<Filters> = {
  id: "inventory.audit-log",
  module: "inventory",
  permissions: INVENTORY_EXPORT_PERMISSIONS,
  parseFilters: parseAuditFilters,
  describeFilters: (f) => ({
    Entity: f.entityType ? (ENTITY_TYPE_LABEL[f.entityType] ?? humanize(f.entityType)) : "",
    Actor: f.actorId ? "Selected actor" : "",
    From: f.dateFrom,
    To: f.dateTo,
  }),
  async load(context, filters) {
    const query: AuditLogFilters = {
      entityType: filters.entityType || undefined,
      actorId: filters.actorId || undefined,
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
    };
    const [entries, actors] = await Promise.all([
      context.scope === "all" ? listAuditLogForExport(context.businessId, query) : listAuditLogForBusiness(context.businessId, query),
      listAuditActors(context.businessId),
    ]);
    const actorName = new Map(actors.map((a) => [a.id, a.name]));

    return {
      module: "inventory",
      resource: "audit-log",
      title: "Audit log",
      sheets: [
        {
          sheetName: "Audit Log",
          columns: [
            { key: "timestamp", header: "Timestamp", type: "datetime", getValue: (e: AuditLogEntry) => e.created_at },
            {
              key: "actor",
              header: "Actor",
              getValue: (e: AuditLogEntry) => (e.actor_id ? (actorName.get(e.actor_id) ?? "Unknown member") : "System"),
            },
            { key: "entity", header: "Entity", getValue: (e: AuditLogEntry) => ENTITY_TYPE_LABEL[e.entity_type] ?? humanize(e.entity_type) },
            { key: "action", header: "Action", getValue: (e: AuditLogEntry) => ACTION_LABEL[e.action] ?? humanize(e.action) },
            { key: "entity_id", header: "Entity ID", getValue: (e: AuditLogEntry) => e.entity_id ?? "" },
            { key: "summary", header: "Summary", getValue: (e: AuditLogEntry) => summarizeAuditChange(e) },
          ],
          rows: entries,
        },
      ],
    };
  },
};
