import { createAdminClient } from "../db/admin";

/**
 * BILL-33 / BILL-36 -- billing's audit trail and structured logs (§62, §98).
 *
 * Audit goes to the existing core.audit_log through core.write_audit_log(), with the
 * service role: most billing transitions happen in a webhook, where there is no signed-in
 * user to attribute them to (actor stays null; a customer's own checkout passes theirs).
 * Payloads are metadata only -- ids, plan keys, statuses, amounts -- never a secret, a
 * card detail or a provider payload.
 */

export type BillingAuditAction =
  | "billing.checkout_started"
  | "billing.checkout_completed"
  | "billing.checkout_failed"
  | "billing.payment_succeeded"
  | "billing.payment_failed"
  | "billing.payment_refunded"
  | "billing.payment_disputed"
  | "billing.subscription_created"
  | "billing.subscription_updated"
  | "billing.subscription_cancelled"
  | "billing.cancellation_requested"
  | "billing.cancellation_undone"
  | "billing.plan_changed"
  | "billing.plan_change_scheduled"
  | "billing.license_reconciled"
  | "billing.webhook_failed"
  | "billing.refund_created"
  | "billing.subscription_synced"
  | "billing.trial_started"
  | "billing.trial_ended";

export async function auditBilling(
  businessId: string,
  action: BillingAuditAction,
  entityType: "subscription" | "billing_payment" | "checkout_session" | "billing_event",
  entityId: string | null,
  after: Record<string, unknown>,
  actorId: string | null = null,
): Promise<void> {
  const core = createAdminClient({ schema: "core" });
  const { error } = await core.rpc("write_audit_log", {
    p_business_id: businessId,
    p_actor_id: actorId,
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_before: null,
    p_after: after,
  });
  // The audit trail must not be the reason a paid customer's licences don't arrive: a
  // failed write is logged loudly, not thrown.
  if (error) logBilling("billing.audit", { business_id: businessId, operation: action, status: "failed", error_code: error.code ?? "unknown" });
}

type LogFields = {
  business_id?: string | null;
  subscription_id?: string | null;
  provider?: string | null;
  operation?: string;
  status: string;
  duration_ms?: number;
  error_code?: string | null;
  event_type?: string | null;
};

/** One JSON line per billing operation, for Vercel's log search. The field list is closed
 * on purpose (the LogFields type): nothing free-form, so nothing sensitive, can ride along. */
export function logBilling(area: string, fields: LogFields): void {
  const line = JSON.stringify({ area, ...fields });
  if (fields.status === "failed") console.error(line);
  else console.info(line);
}
