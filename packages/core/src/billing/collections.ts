import { createAdminClient } from "../db/admin";
import { createClient } from "../db/server";
import { decryptApiKey, encryptApiKey, fingerprintApiKey } from "../crypto/api-key";
import { createRazorpayPaymentLink } from "./razorpay";
import { fromMinorUnits, toMinorUnits } from "./status";
import { createStripePaymentCheckout } from "./stripe";
import type { GatewayAccountSummary, GatewayProvider, NormalizedGatewayEvent, PaymentRequest } from "./types";

/**
 * Collections: a business taking online payment from ITS customers for a
 * core.documents invoice, through the business's own Stripe/Razorpay account (the
 * platform never holds tenant funds). Secrets are encrypted at rest with the same
 * AES-256-GCM helper as BYOK AI keys and are only ever decrypted here, server-side.
 *
 * The webhook URL a business configures in its gateway dashboard is
 * /api/webhooks/payments/<provider>/<businessId>, verified with that business's own
 * webhook secret.
 */
function coreAdmin() {
  return createAdminClient({ schema: "core" });
}

const COLLECTIBLE_DOC_TYPES = new Set(["invoice", "debit_note", "proforma_invoice"]);

export function gatewayWebhookPath(provider: GatewayProvider, businessId: string): string {
  return `/api/webhooks/payments/${provider}/${businessId}`;
}

/** RLS-scoped; only billing managers see rows, and never the ciphertext columns. */
export async function listGatewayAccounts(businessId: string): Promise<GatewayAccountSummary[]> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase
    .from("payment_gateway_accounts")
    .select("business_id, provider, key_id, secret_fingerprint, is_active, updated_at")
    .eq("business_id", businessId);
  if (error) throw error;
  return data as GatewayAccountSummary[];
}

/** Caller must have authorized billing.manage on the business. */
export async function saveGatewayAccount(input: {
  businessId: string;
  provider: GatewayProvider;
  keyId: string | null;
  secret: string;
  webhookSecret: string;
  userId: string;
}): Promise<void> {
  const { error } = await coreAdmin()
    .from("payment_gateway_accounts")
    .upsert(
      {
        business_id: input.businessId,
        provider: input.provider,
        key_id: input.provider === "razorpay" ? input.keyId : null,
        encrypted_secret: encryptApiKey(input.secret),
        encrypted_webhook_secret: encryptApiKey(input.webhookSecret),
        secret_fingerprint: fingerprintApiKey(input.secret),
        is_active: true,
        created_by: input.userId,
      },
      { onConflict: "business_id,provider" },
    );
  if (error) throw error;
}

export async function removeGatewayAccount(businessId: string, provider: GatewayProvider): Promise<void> {
  const { error } = await coreAdmin()
    .from("payment_gateway_accounts")
    .delete()
    .eq("business_id", businessId)
    .eq("provider", provider);
  if (error) throw error;
}

async function loadGatewayAccount(businessId: string, provider: GatewayProvider) {
  const { data, error } = await coreAdmin()
    .from("payment_gateway_accounts")
    .select("key_id, encrypted_secret, encrypted_webhook_secret, is_active")
    .eq("business_id", businessId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.is_active) return null;
  return {
    keyId: data.key_id as string | null,
    secret: decryptApiKey(data.encrypted_secret as string),
    webhookSecret: decryptApiKey(data.encrypted_webhook_secret as string),
  };
}

/** For the per-business webhook route: the secret to verify its signature with. */
export async function getGatewayWebhookSecret(businessId: string, provider: GatewayProvider): Promise<string | null> {
  return (await loadGatewayAccount(businessId, provider))?.webhookSecret ?? null;
}

/**
 * Creates a hosted payment page for a document's open balance. Runs the document and
 * balance reads through the caller's RLS session (so a document the caller can't see
 * can't be charged) and requires payments.record.
 */
export async function createPaymentRequestForDocument(input: {
  documentId: string;
  provider: GatewayProvider;
  userId: string;
  returnUrl: string;
}): Promise<PaymentRequest> {
  const session = await createClient({ schema: "core" });
  const { data: doc, error: docError } = await session
    .from("documents")
    .select("id, business_id, doc_type, number, party_id")
    .eq("id", input.documentId)
    .maybeSingle();
  if (docError) throw docError;
  if (!doc) throw new Error("Document not found.");
  if (!COLLECTIBLE_DOC_TYPES.has(doc.doc_type as string)) {
    throw new Error("Online payment can only be requested for invoices, debit notes and proforma invoices.");
  }

  const { data: allowed, error: permError } = await session.rpc("has_permission", {
    p_business_id: doc.business_id,
    p_key: "payments.record",
  });
  if (permError) throw permError;
  if (!allowed) throw new Error("You don't have permission to collect payments (payments.record).");

  const { data: balance, error: balanceError } = await session
    .from("document_balances")
    .select("balance_amount")
    .eq("document_id", doc.id)
    .single();
  if (balanceError) throw balanceError;
  const amount = Number(balance.balance_amount);
  if (!(amount > 0)) throw new Error("This document has no balance left to collect.");

  const admin = coreAdmin();
  const [{ data: settings }, { data: party }] = await Promise.all([
    admin.from("business_settings").select("currency").eq("business_id", doc.business_id).maybeSingle(),
    admin.from("parties").select("name, email, phone").eq("id", doc.party_id).single(),
  ]);
  const currency = ((settings?.currency as string | undefined) ?? "INR").toUpperCase();

  const account = await loadGatewayAccount(doc.business_id as string, input.provider);
  if (!account) throw new Error(`Connect a ${input.provider} account for this business first.`);

  const { data: request, error: insertError } = await admin
    .from("payment_requests")
    .insert({
      business_id: doc.business_id,
      document_id: doc.id,
      provider: input.provider,
      amount,
      currency,
      created_by: input.userId,
    })
    .select("*")
    .single();
  if (insertError) throw insertError;

  const description = `Payment for ${doc.number ?? "document"}`;
  const metadata = {
    business_id: doc.business_id as string,
    document_id: doc.id as string,
    payment_request_id: request.id as string,
  };
  try {
    const created =
      input.provider === "stripe"
        ? await createStripePaymentCheckout({
            secretKey: account.secret,
            amountMinor: toMinorUnits(amount),
            currency,
            description,
            customerEmail: (party?.email as string | null) ?? null,
            metadata,
            successUrl: `${input.returnUrl}?payment=success`,
            cancelUrl: `${input.returnUrl}?payment=cancelled`,
            idempotencyKey: `payreq:${request.id}`,
          }).then((s) => ({ ref: s.id, url: s.url }))
        : await createRazorpayPaymentLink({
            keyId: account.keyId ?? "",
            keySecret: account.secret,
            amountMinor: toMinorUnits(amount),
            currency,
            description,
            referenceId: request.id as string,
            customer: {
              name: (party?.name as string | undefined) ?? undefined,
              email: (party?.email as string | undefined) ?? undefined,
              contact: (party?.phone as string | undefined) ?? undefined,
            },
            notes: metadata,
            callbackUrl: input.returnUrl,
          }).then((l) => ({ ref: l.id, url: l.shortUrl }));

    const { data: updated, error: updateError } = await admin
      .from("payment_requests")
      .update({ provider_ref: created.ref, url: created.url })
      .eq("id", request.id)
      .select("*")
      .single();
    if (updateError) throw updateError;
    return updated as PaymentRequest;
  } catch (error) {
    await admin.from("payment_requests").update({ status: "failed" }).eq("id", request.id);
    throw error;
  }
}

/**
 * Applies a verified collections webhook for one business. The payment request is
 * located by the provider's own reference, scoped to the business the webhook URL
 * names -- metadata alone is never trusted to pick the business. Recording is atomic
 * and idempotent in core.record_gateway_payment().
 */
export async function applyCollectionEvent(
  businessId: string,
  event: NormalizedGatewayEvent,
): Promise<"processed" | "ignored"> {
  if (event.kind !== "payment_succeeded") return "ignored";
  const admin = coreAdmin();
  const { data: request, error } = await admin
    .from("payment_requests")
    .select("id")
    .eq("business_id", businessId)
    .eq("provider", event.provider)
    .eq("provider_ref", event.reference)
    .maybeSingle();
  if (error) throw error;
  if (!request) return "ignored";

  const { error: rpcError } = await admin.rpc("record_gateway_payment", {
    p_payment_request_id: request.id,
    p_gateway_payment_id: event.paymentId,
    p_amount: fromMinorUnits(event.amountMinor),
    p_currency: event.currency,
  });
  if (rpcError) throw rpcError;
  return "processed";
}
