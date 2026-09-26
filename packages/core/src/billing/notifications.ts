import { createAdminClient } from "../db/admin";
import { logBilling } from "./observability";

/**
 * BILL-34 / BILL-35 -- billing moments that deserve a message (§60, §61). Webhook code
 * never sends email itself: it publishes one of these to core.domain_events, and the
 * existing drain (billing/event-handlers.ts) does the sending. Payloads carry display
 * facts only -- plan name, amount, dates -- never provider ids or payment details.
 */
export type BillingNotificationType =
  | "billing.subscription_activated"
  | "billing.subscription_cancelled"
  | "billing.cancellation_scheduled"
  | "billing.plan_changed"
  | "billing.plan_change_scheduled"
  | "billing.payment_succeeded"
  | "billing.payment_failed"
  | "billing.payment_action_required";

export const BILLING_NOTIFICATION_TYPES: BillingNotificationType[] = [
  "billing.subscription_activated",
  "billing.subscription_cancelled",
  "billing.cancellation_scheduled",
  "billing.plan_changed",
  "billing.plan_change_scheduled",
  "billing.payment_succeeded",
  "billing.payment_failed",
  "billing.payment_action_required",
];

export async function publishBillingNotification(
  businessId: string,
  type: BillingNotificationType,
  payload: Record<string, string | number | null>,
): Promise<void> {
  const core = createAdminClient({ schema: "core" });
  const { error } = await core.from("domain_events").insert({ business_id: businessId, type, payload });
  // A notification is never worth failing the billing change it describes.
  if (error) logBilling("billing.notification", { business_id: businessId, operation: type, status: "failed", error_code: error.code ?? "unknown" });
}
