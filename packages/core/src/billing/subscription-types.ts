/**
 * BILL-02 -- the provider-neutral vocabulary of subscription billing
 * (docs/plan/14-SUBSCRIPTION-BILLING-BACKLOG.md §14, §19, §20, §59).
 *
 * Only the provider adapters (./providers/*) know Razorpay's or Stripe's own shapes. Every
 * other file speaks these types: WonderArk's normalized subscription and payment states,
 * and a normalized webhook event. Amounts are always major units (2999.00 INR), never the
 * providers' minor units.
 */

export type BillingProviderKey = "razorpay" | "stripe";
export type BillingEnvironment = "test" | "live";
export type BillingInterval = "month" | "year";

/** WonderArk's own subscription states (§59). Provider states are mapped into these by
 * ./state.ts -- never copied across unmapped. */
export type SubscriptionStatus =
  | "incomplete"
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "cancel_scheduled"
  | "cancelled"
  | "unpaid"
  | "expired";

export type PaymentStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "refunded"
  | "partially_refunded"
  | "disputed"
  | "chargeback";

/** A provider's own configuration, decrypted, server-side only. */
export type ProviderConfig = {
  provider: BillingProviderKey;
  environment: BillingEnvironment;
  enabled: boolean;
  priority: number;
  supportedCurrencies: string[];
  supportedCountries: string[];
  /** Razorpay Key ID / Stripe publishable key -- the only credential a browser may see. */
  publicKey: string | null;
  secretKey: string | null;
  webhookSecret: string | null;
  /** Where the configuration came from -- the admin portal, or deployment env vars. */
  source: "platform" | "env";
};

export type ProviderSubscription = {
  id: string;
  customerId: string | null;
  status: SubscriptionStatus;
  /** The provider's own status word, kept for display and reconciliation. */
  providerStatus: string;
  /** The provider price/plan the subscription bills -- maps back to platform.plan_prices. */
  providerPriceId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  /** What we attached at creation (business id, checkout session id) and read back. */
  metadata: Record<string, string>;
};

export type ProviderPayment = {
  id: string | null;
  invoiceId: string | null;
  orderId: string | null;
  invoiceNumber: string | null;
  subscriptionId: string | null;
  amount: number;
  taxAmount: number | null;
  currency: string;
  status: PaymentStatus;
  methodType: string | null;
  paidAt: string | null;
  failedAt: string | null;
  failureCode: string | null;
  /** A message safe to show a customer -- never the provider's raw payload. */
  failureMessage: string | null;
  refundedAmount: number;
};

/** A verified provider webhook, normalized. `kind` says what the handler should do with
 * it; `unhandled` events are recorded and acknowledged, never an error (§25). */
export type ProviderWebhookEvent = {
  id: string;
  type: string;
  occurredAt: string | null;
  kind: "subscription" | "payment" | "checkout" | "unhandled";
  subscription?: ProviderSubscription;
  payment?: ProviderPayment;
  checkout?: {
    checkoutId: string;
    subscriptionId: string | null;
    customerId: string | null;
    /** WonderArk's checkout_sessions.id, echoed back by the provider. */
    clientReference: string | null;
  };
  /** Present when the provider lets us fetch the authoritative subscription state rather
   * than trust the event body alone. */
  subscriptionIdToRefresh?: string | null;
  /** A payment whose authoritative state should be fetched (refunds report only a delta). */
  paymentIdToRefresh?: string | null;
};

/** What checkout hands the browser (§27). Never a secret: Stripe gets a redirect URL,
 * Razorpay the options its own Checkout.js needs (the public Key ID included). */
export type CheckoutResult =
  | { provider: "stripe"; mode: "redirect"; url: string; sessionId: string }
  | {
      provider: "razorpay";
      mode: "checkout";
      sessionId: string;
      checkoutOptions: {
        key: string;
        subscription_id: string;
        name: string;
        description: string;
        prefill: { email?: string };
        notes: Record<string, string>;
      };
    }
  | { provider: "internal"; mode: "activated"; sessionId: string };

export type CreateCheckoutInput = {
  customerId: string;
  providerPriceId: string;
  /** WonderArk's checkout_sessions.id. */
  sessionId: string;
  businessId: string;
  planKey: string;
  billingInterval: "month" | "year";
  customerEmail: string | null;
  successUrl: string;
  cancelUrl: string;
  /** Idempotency key passed to the provider as well (§53). */
  idempotencyKey: string;
};

export type ProviderCheckout = {
  checkoutId: string;
  /** Razorpay creates the subscription up front; Stripe only after checkout completes. */
  subscriptionId: string | null;
  redirectUrl: string | null;
};

export type ChangeTiming = "immediate" | "next_renewal";

/**
 * BILL-02 -- the one interface both providers implement (§14). Everything is keyed by
 * provider ids; nothing takes or returns a provider SDK type.
 */
export interface BillingProvider {
  readonly key: BillingProviderKey;
  createCustomer(input: { businessId: string; name: string; email: string | null }): Promise<{ id: string }>;
  createCheckout(input: CreateCheckoutInput): Promise<ProviderCheckout>;
  getSubscription(subscriptionId: string): Promise<ProviderSubscription>;
  cancelSubscription(subscriptionId: string, options: { atPeriodEnd: boolean }): Promise<ProviderSubscription>;
  resumeSubscription(subscriptionId: string): Promise<ProviderSubscription>;
  changeSubscription(
    subscriptionId: string,
    input: { providerPriceId: string; timing: ChangeTiming; prorate: boolean },
  ): Promise<ProviderSubscription>;
  /** A provider-hosted page for payment methods and invoices, where the provider has one. */
  createPortalSession(input: { customerId: string; subscriptionId: string | null; returnUrl: string }): Promise<{ url: string } | null>;
  getPayment(paymentId: string): Promise<ProviderPayment>;
  refundPayment(paymentId: string, input: { amount: number | null; reason: string }): Promise<{ refundId: string; status: string }>;
  /** Verifies the signature over the raw body and returns the normalized event -- or throws
   * WebhookVerificationError. Nothing is trusted before this returns. */
  verifyWebhook(rawBody: string, headers: Headers): ProviderWebhookEvent;
}

export class WebhookVerificationError extends Error {
  constructor(message = "Invalid webhook signature.") {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

/** A provider API failure, carrying only what is safe to log and show an admin (§97). */
export class BillingProviderError extends Error {
  constructor(
    readonly provider: BillingProviderKey,
    readonly operation: string,
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "BillingProviderError";
  }
}

export class BillingNotConfiguredError extends Error {
  constructor(message = "Billing isn't configured for this plan yet.") {
    super(message);
    this.name = "BillingNotConfiguredError";
  }
}
