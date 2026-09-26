import { loadApiPolicy } from "../api-v1/policy";
import { createHash } from "node:crypto";
import { createAdminClient } from "../db/admin";
import { createProvider, loadProviderConfig } from "./provider-config";
import { parseRazorpayEvent } from "./providers/razorpay";
import { parseStripeEvent } from "./providers/stripe";
import { auditBilling, logBilling } from "./observability";
import { reconcileSubscriptionLicenses } from "./provisioning";
import { syncPayment, syncSubscription, UnknownBillingReferenceError, type SyncedPayment, type SyncedSubscription } from "./sync";
import {
  BillingProviderError,
  WebhookVerificationError,
  type BillingProviderKey,
  type ProviderSubscription,
  type ProviderWebhookEvent,
} from "./subscription-types";

/**
 * BILL-12 / BILL-13 / BILL-14 -- provider webhooks (§21-§25, §95, §96).
 *
 * The request path does only what must happen before answering the provider: verify the
 * signature over the raw body, and persist the event once -- the unique
 * (provider, environment, provider_event_id) index turns a redelivery into a no-op. The
 * route then answers 200 and processes the stored event after the response
 * (processBillingEvent); a failure there marks the event `failed` and the billing cron
 * retries it from the stored payload, so WonderArk never depends on the provider
 * resending (§96).
 *
 * Nothing is trusted before verification: an unsigned or mis-signed request touches no
 * table except the provider's last_webhook_failure_at timestamp.
 */

export type IngestResult =
  | { status: 200; eventId: string; duplicate: false }
  | { status: 200; eventId: null; duplicate: true }
  | { status: 401 | 503; error: string };


export async function ingestWebhook(providerKey: BillingProviderKey, rawBody: string, headers: Headers): Promise<IngestResult> {
  const platform = createAdminClient({ schema: "platform" });
  const config = await loadProviderConfig(providerKey);
  if (!config?.webhookSecret) {
    logBilling("billing.webhook", { provider: providerKey, operation: "ingest", status: "failed", error_code: "not_configured" });
    return { status: 503, error: "Webhook endpoint is not configured." };
  }

  let event: ProviderWebhookEvent;
  try {
    // PLATFORM-P1-06.3: signatures are always required; the timestamp window is policy.
    const policy = await loadApiPolicy();
    event = createProvider(config).verifyWebhook(rawBody, headers, { signatureToleranceSeconds: policy.webhookSignatureToleranceSeconds });
  } catch (error) {
    await platform.from("billing_providers").update({ last_webhook_failure_at: new Date().toISOString() }).eq("provider", providerKey);
    const code = error instanceof WebhookVerificationError ? "invalid_signature" : "malformed";
    logBilling("billing.webhook", { provider: providerKey, operation: "verify", status: "failed", error_code: code });
    return { status: 401, error: "Invalid signature." };
  }

  const { data, error } = await platform
    .from("billing_events")
    .upsert(
      {
        provider: providerKey,
        environment: config.environment,
        provider_event_id: event.id,
        event_type: event.type,
        payload: JSON.parse(rawBody),
        payload_hash: createHash("sha256").update(rawBody).digest("hex"),
      },
      { onConflict: "provider,environment,provider_event_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;
  await platform.from("billing_providers").update({ last_webhook_at: new Date().toISOString() }).eq("provider", providerKey);

  const inserted = (data ?? [])[0] as { id: string } | undefined;
  logBilling("billing.webhook", {
    provider: providerKey,
    operation: "ingest",
    event_type: event.type,
    status: inserted ? "received" : "duplicate",
  });
  return inserted ? { status: 200, eventId: inserted.id, duplicate: false } : { status: 200, eventId: null, duplicate: true };
}

type BillingEventRow = {
  id: string;
  provider: BillingProviderKey;
  environment: "test" | "live";
  provider_event_id: string;
  event_type: string;
  processing_status: string;
  attempt_count: number;
  payload: unknown;
};

function reparse(row: BillingEventRow): ProviderWebhookEvent {
  const body = JSON.stringify(row.payload);
  const event = row.provider === "stripe" ? parseStripeEvent(body) : parseRazorpayEvent(body, row.provider_event_id);
  return { ...event, id: row.provider_event_id };
}

export type ProcessOutcome = "processed" | "unhandled" | "failed" | "skipped";

/**
 * Processes one stored event: fetch the authoritative provider state where the provider
 * offers it, sync the subscription and payment, then reconcile licences. Safe to call
 * more than once -- a claimed or finished event is skipped, and every step it takes is
 * itself idempotent.
 */
export async function processBillingEvent(eventRowId: string): Promise<ProcessOutcome> {
  const started = Date.now();
  const platform = createAdminClient({ schema: "platform" });
  const { data: rowData, error: readError } = await platform
    .from("billing_events")
    .select("id, provider, environment, provider_event_id, event_type, processing_status, attempt_count, payload")
    .eq("id", eventRowId)
    .single();
  if (readError) throw readError;
  const row = rowData as BillingEventRow;
  if (row.processing_status === "processed" || row.processing_status === "unhandled") return "skipped";

  // Claim it: the attempt_count match means two workers can't both take the same attempt.
  const { data: claimed, error: claimError } = await platform
    .from("billing_events")
    .update({ processing_status: "processing", attempt_count: row.attempt_count + 1 })
    .eq("id", row.id)
    .eq("attempt_count", row.attempt_count)
    .select("id");
  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) return "skipped";

  let subscription: SyncedSubscription | null = null;
  let payment: SyncedPayment | null = null;
  try {
    const event = reparse(row);
    if (event.kind === "unhandled") {
      await finish(row.id, { processing_status: "unhandled" });
      return "unhandled";
    }

    const config = await loadProviderConfig(row.provider);
    if (!config || config.environment !== row.environment || !config.secretKey) {
      throw new BillingProviderError(row.provider, "process_event", "not_configured", "The provider's API credentials for this environment aren't configured.");
    }
    const provider = createProvider(config);

    // The event body is a snapshot; the provider's API is the current truth. Refetching
    // makes out-of-order delivery harmless.
    let providerSubscription: ProviderSubscription | undefined = event.subscription;
    if (event.subscriptionIdToRefresh) providerSubscription = await provider.getSubscription(event.subscriptionIdToRefresh);
    if (providerSubscription) {
      subscription = await syncSubscription(row.provider, row.environment, providerSubscription, {
        checkoutSessionId: event.checkout?.clientReference ?? null,
      });
    }

    const providerPayment = event.paymentIdToRefresh ? await provider.getPayment(event.paymentIdToRefresh) : event.payment;
    if (providerPayment) payment = await syncPayment(row.provider, row.environment, providerPayment);

    if (subscription) {
      await reconcileSubscriptionLicenses(subscription.id);
      for (const replaced of subscription.replacedSubscriptionIds) await reconcileSubscriptionLicenses(replaced);
    }

    if (!subscription && !payment) {
      // Verified, but about nothing WonderArk created (another app on the same provider
      // account, or a checkout abandoned before a session existed): acknowledged, kept.
      await finish(row.id, { processing_status: "unhandled", error_code: "unknown_reference", error_message_safe: "No matching WonderArk subscription or payment." });
      return "unhandled";
    }

    await finish(row.id, {
      processing_status: "processed",
      business_id: subscription?.businessId ?? payment?.businessId ?? null,
      subscription_id: subscription?.id ?? null,
      payment_id: payment?.id ?? null,
      error_code: null,
      error_message_safe: null,
    });
    logBilling("billing.webhook", {
      provider: row.provider,
      operation: "process",
      event_type: row.event_type,
      business_id: subscription?.businessId ?? payment?.businessId ?? null,
      subscription_id: subscription?.id ?? null,
      status: "processed",
      duration_ms: Date.now() - started,
    });
    return "processed";
  } catch (error) {
    if (error instanceof UnknownBillingReferenceError) {
      await finish(row.id, { processing_status: "unhandled", error_code: "unknown_reference", error_message_safe: error.message });
      return "unhandled";
    }
    const code = error instanceof BillingProviderError ? error.code : ((error as { code?: string })?.code ?? "processing_error");
    const message = error instanceof BillingProviderError ? error.message : "Processing failed; it will be retried.";
    const businessId = subscription?.businessId ?? payment?.businessId ?? null;
    await finish(row.id, {
      processing_status: "failed",
      business_id: businessId,
      subscription_id: subscription?.id ?? null,
      payment_id: payment?.id ?? null,
      error_code: String(code).slice(0, 100),
      error_message_safe: message.slice(0, 300),
    });
    if (businessId) await auditBilling(businessId, "billing.webhook_failed", "billing_event", row.id, { provider: row.provider, event_type: row.event_type, error_code: code });
    logBilling("billing.webhook", {
      provider: row.provider,
      operation: "process",
      event_type: row.event_type,
      business_id: businessId,
      status: "failed",
      error_code: String(code),
      duration_ms: Date.now() - started,
    });
    return "failed";
  }
}

async function finish(id: string, fields: Record<string, unknown>): Promise<void> {
  const platform = createAdminClient({ schema: "platform" });
  const { error } = await platform
    .from("billing_events")
    .update({ ...fields, processed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/**
 * The billing cron's retry sweep (§96): failed events under the attempt cap, and events
 * stranded in received/processing past the webhook timeout (a function that died after
 * answering the provider). Returns how many were retried and how many now succeed.
 */
export async function retryBillingEvents(limit = 50): Promise<{ retried: number; processed: number }> {
  const platform = createAdminClient({ schema: "platform" });
  // PLATFORM-P1-06.3 webhook policy: how many attempts an event gets, and how long one may
  // sit in received/processing before it counts as timed out.
  const policy = await loadApiPolicy();
  const staleBefore = new Date(Date.now() - policy.webhookTimeoutSeconds * 1000).toISOString();
  const { data, error } = await platform
    .from("billing_events")
    .select("id")
    .lt("attempt_count", policy.webhookMaxRetries)
    .or(`processing_status.eq.failed,and(processing_status.in.(received,processing),received_at.lt.${staleBefore})`)
    .order("received_at")
    .limit(limit);
  if (error) throw error;
  let processed = 0;
  for (const { id } of (data ?? []) as { id: string }[]) {
    if ((await processBillingEvent(id)) === "processed") processed += 1;
  }
  return { retried: data?.length ?? 0, processed };
}
