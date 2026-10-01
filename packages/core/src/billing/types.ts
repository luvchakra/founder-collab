export type GatewayProvider = "stripe" | "razorpay";

/** Platform-normalized subscription state -- both providers' vocabularies map onto this
 * (status.ts), and core.subscriptions.status stores it. */
export type SubscriptionStatus = "incomplete" | "active" | "past_due" | "halted" | "cancelled" | "paused";

/** A verified webhook, reduced to what the platform acts on. Anything else is "ignored"
 * (still recorded in core.payment_gateway_events for traceability). */
export type NormalizedGatewayEvent =
  | {
      kind: "subscription";
      provider: GatewayProvider;
      eventId: string;
      eventType: string;
      occurredAt: Date;
      subscriptionId: string;
      customerId: string | null;
      status: SubscriptionStatus;
      currentPeriodEnd: Date | null;
      cancelAtPeriodEnd: boolean;
      metadata: Record<string, string>;
    }
  | {
      kind: "payment_succeeded";
      provider: GatewayProvider;
      eventId: string;
      eventType: string;
      occurredAt: Date;
      /** Provider payment id (Stripe payment_intent pi_..., Razorpay pay_...). */
      paymentId: string;
      amountMinor: number;
      currency: string;
      /** The hosted page this payment completed (Stripe cs_..., Razorpay plink_...). */
      reference: string;
      metadata: Record<string, string>;
    }
  | {
      kind: "ignored";
      provider: GatewayProvider;
      eventId: string;
      eventType: string;
      occurredAt: Date;
    };

export interface Subscription {
  id: string;
  account_id: string;
  business_id: string;
  module_key: string;
  provider: GatewayProvider;
  provider_subscription_id: string;
  provider_customer_id: string | null;
  price_id: string | null;
  status: SubscriptionStatus;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  checkout_url: string | null;
  provider_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingPrice {
  id: string;
  module_key: string;
  provider: GatewayProvider;
  currency: string;
  amount_minor: number;
  billing_interval: "month" | "year";
  provider_price_id: string;
  is_active: boolean;
}

export interface PaymentRequest {
  id: string;
  business_id: string;
  document_id: string;
  provider: GatewayProvider;
  provider_ref: string | null;
  amount: number;
  currency: string;
  status: "created" | "paid" | "expired" | "cancelled" | "failed";
  url: string | null;
  payment_id: string | null;
  created_at: string;
}

export interface GatewayAccountSummary {
  business_id: string;
  provider: GatewayProvider;
  key_id: string | null;
  secret_fingerprint: string;
  is_active: boolean;
  updated_at: string;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly provider: GatewayProvider,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}
