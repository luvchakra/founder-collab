import type { AuditLogEntry } from "./types";

/** Founder-facing label per `audit_log.action` value -- covers every trigger currently
 * wired to core.write_audit_log() (see D-10's and inventory's own migrations). A future
 * module's own trigger adds its action here, not a parallel label map. */
export const ACTION_LABEL: Record<string, string> = {
  "document.status_changed": "Document status changed",
  "stock.adjusted": "Stock adjusted",
  "stock.contract_adjusted": "Stock adjusted via module contract",
  "business_settings.updated": "Business settings changed",
};

export const ENTITY_TYPE_LABEL: Record<string, string> = {
  document: "Document",
  stock_movement: "Stock Movement",
  business_settings: "Business Settings",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A compact, human-readable summary of what changed: "field: old -> new" when there's a
 * before snapshot to diff against, or just the recorded fields when there isn't (e.g. a
 * stock adjustment has no meaningful "before"). Ported from stockpilot-ai-ops's own
 * describeChange() verbatim. */
export function describeAuditChange(row: AuditLogEntry): string {
  const after = isPlainObject(row.after) ? row.after : null;
  const before = isPlainObject(row.before) ? row.before : null;
  if (!after) return "—";
  if (!before) {
    return Object.entries(after)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(", ");
  }
  const changed = Object.keys(after).filter(
    (k) => JSON.stringify(after[k]) !== JSON.stringify(before[k]),
  );
  if (changed.length === 0) return "—";
  return changed.map((k) => `${k}: ${before[k] ?? "—"} -> ${after[k] ?? "—"}`).join(", ");
}
