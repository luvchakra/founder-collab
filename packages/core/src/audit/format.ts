import type { AuditLogEntry } from "./types";

/** Founder-facing label per `audit_log.action` value -- covers every trigger currently
 * wired to core.write_audit_log() (see D-10's and inventory's own migrations). A future
 * module's own trigger adds its action here, not a parallel label map. */
export const ACTION_LABEL: Record<string, string> = {
  "document.status_changed": "Document status changed",
  "stock.adjusted": "Stock adjusted",
  "stock.contract_adjusted": "Stock adjusted via module contract",
  "business_settings.updated": "Business settings changed",
  "crm_lead.status_changed": "CRM lead status changed",
  "crm_opportunity.stage_changed": "CRM opportunity stage changed",
  "crm_lead.assigned": "CRM lead assigned",
  "crm_opportunity.assigned": "CRM opportunity assigned",
  "crm_conversation.assigned": "CRM conversation assigned",
  "crm_interaction.sent": "CRM message sent",
  "crm_channel_connection.connected": "CRM channel connected",
  "crm_channel_connection.disconnected": "CRM channel disconnected",
  "crm_channel_connection.health_changed": "CRM channel connection health changed",
  "crm_opportunity.fsm_quote_created": "FSM quote created from CRM opportunity",
  "crm_opportunity.fsm_job_created": "FSM job created from CRM opportunity",
  "crm_buying_intent.recalculated": "Buying intent score recalculated",
  "crm_opportunity.fulfillment_requirement_set": "CRM opportunity fulfillment requirement set",
  "crm_opportunity.fulfillment_requested": "CRM opportunity inventory fulfillment requested",
  "crm_opportunity.fulfillment_partial_requested": "CRM opportunity partial inventory fulfillment requested",
  "crm_opportunity.fulfillment_wait_selected": "CRM opportunity chose to wait for full inventory availability",
  "crm_opportunity.assessment_requirement_set": "CRM opportunity assessment requirement set",
  "crm_opportunity.assessment_requested": "CRM opportunity FSM assessment requested",
};

export const ENTITY_TYPE_LABEL: Record<string, string> = {
  document: "Document",
  stock_movement: "Stock Movement",
  business_settings: "Business Settings",
  crm_lead: "CRM Lead",
  crm_opportunity: "CRM Opportunity",
  crm_conversation: "CRM Conversation",
  crm_interaction: "CRM Interaction",
  crm_channel_connection: "CRM Channel Connection",
  crm_buying_intent_score: "CRM Buying Intent Score",
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
