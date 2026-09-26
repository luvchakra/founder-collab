import type { SubscriptionStatus } from "./subscription-types";

/**
 * BILL-15 -- provider subscription states mapped into WonderArk's own (§59), and the one
 * rule that decides whether a subscription keeps its modules (§7: payment state and
 * licence state are separate).
 *
 * Neither provider's words are assumed to match the other's or ours; an unknown state
 * maps to `incomplete` -- the one state that never grants anything -- rather than guessing.
 */

const STRIPE_STATUS: Record<string, SubscriptionStatus> = {
  incomplete: "incomplete",
  incomplete_expired: "expired",
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  canceled: "cancelled",
  unpaid: "unpaid",
  paused: "paused",
};

export function mapStripeStatus(status: string, cancelAtPeriodEnd: boolean): SubscriptionStatus {
  const mapped = STRIPE_STATUS[status] ?? "incomplete";
  return mapped === "active" && cancelAtPeriodEnd ? "cancel_scheduled" : mapped;
}

/**
 * Razorpay's subscription lifecycle: created -> authenticated (mandate approved) ->
 * active (first charge) -> pending (a charge failed, retrying) -> halted (retries
 * exhausted); cancelled/completed/expired end it.
 */
const RAZORPAY_STATUS: Record<string, SubscriptionStatus> = {
  created: "incomplete",
  authenticated: "incomplete",
  active: "active",
  pending: "past_due",
  halted: "unpaid",
  paused: "paused",
  cancelled: "cancelled",
  completed: "expired",
  expired: "expired",
};

export function mapRazorpayStatus(status: string, cancelAtPeriodEnd: boolean): SubscriptionStatus {
  const mapped = RAZORPAY_STATUS[status] ?? "incomplete";
  return mapped === "active" && cancelAtPeriodEnd ? "cancel_scheduled" : mapped;
}

/**
 * Whether a subscription in this state keeps its plan's modules. `past_due` does -- the
 * customer is told "your subscription is still active while we try to recover payment"
 * (§11) -- and so does `cancel_scheduled`, whose paid period hasn't ended (§8). `unpaid`,
 * `paused`, `cancelled` and `expired` do not: their licences move into the existing 30-day
 * read-only grace, never straight to deletion (ADR-9). `incomplete` never granted anything.
 */
export function isEntitledStatus(status: SubscriptionStatus): boolean {
  return status === "active" || status === "trialing" || status === "past_due" || status === "cancel_scheduled";
}

/** Whether a subscription still occupies the business's one live slot (§50) -- mirrors the
 * partial unique index subscriptions_one_live_per_business_idx. */
export function isLiveStatus(status: SubscriptionStatus): boolean {
  return (
    status === "trialing" ||
    status === "active" ||
    status === "past_due" ||
    status === "paused" ||
    status === "cancel_scheduled" ||
    status === "unpaid"
  );
}

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  incomplete: "Awaiting payment",
  trialing: "Trial",
  active: "Active",
  past_due: "Payment needs attention",
  paused: "Paused",
  cancel_scheduled: "Cancels at period end",
  cancelled: "Cancelled",
  unpaid: "Unpaid",
  expired: "Expired",
};
