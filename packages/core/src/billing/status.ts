import type { GatewayProvider, SubscriptionStatus } from "./types";

/**
 * Provider subscription status -> platform status.
 *
 * Stripe: incomplete | incomplete_expired | trialing | active | past_due | canceled |
 *   unpaid | paused (https://docs.stripe.com/api/subscriptions/object#subscription_object-status)
 * Razorpay: created | authenticated | active | pending | halted | cancelled | completed |
 *   expired | paused (https://razorpay.com/docs/payments/subscriptions/states/)
 *
 * Unknown values map to "incomplete" -- the one status with no license effect -- so a
 * new provider status can never accidentally grant or revoke access.
 */
export function mapSubscriptionStatus(provider: GatewayProvider, raw: string): SubscriptionStatus {
  const s = raw.toLowerCase();
  if (provider === "stripe") {
    switch (s) {
      case "active":
      case "trialing":
        return "active";
      case "past_due":
        return "past_due";
      case "unpaid":
        return "halted";
      case "canceled":
      case "incomplete_expired":
        return "cancelled";
      case "paused":
        return "paused";
      default:
        return "incomplete";
    }
  }
  switch (s) {
    case "active":
      return "active";
    case "pending":
      return "past_due";
    case "halted":
      return "halted";
    case "cancelled":
    case "completed":
    case "expired":
      return "cancelled";
    case "paused":
      return "paused";
    default:
      return "incomplete";
  }
}

/**
 * What a subscription in this status means for the module license (C-4 lifecycle):
 * - active / past_due -> licensed. past_due keeps access while the provider retries the
 *   charge (dunning); access only changes once retries are exhausted (halted).
 * - halted / cancelled / paused -> deactivate, i.e. ADR-9's 30-day read-only grace,
 *   never deletion. Only applied if no *other* live subscription covers the same module.
 * - incomplete -> nothing yet (checkout not finished).
 */
export function licenseEffect(status: SubscriptionStatus): "activate" | "deactivate" | "none" {
  if (status === "active" || status === "past_due") return "activate";
  if (status === "halted" || status === "cancelled" || status === "paused") return "deactivate";
  return "none";
}

export const LIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ["incomplete", "active", "past_due"];

/** Major-unit amount (e.g. 1499.50) -> provider minor units (149950). Both providers
 * use 2-decimal minor units for INR/USD/EUR/GBP, the currencies this platform bills in. */
export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export function fromMinorUnits(amountMinor: number): number {
  return Math.round(amountMinor) / 100;
}
