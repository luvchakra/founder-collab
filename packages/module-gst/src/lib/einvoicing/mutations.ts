import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { encryptApiKey } from "@cofounderai/core/crypto/api-key";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";
import { createAdminClient } from "../../db/admin";
import { callGsp, decryptGspSecrets } from "../gsp-client";
import type { Einvoice } from "./types";

export type EinvoiceCredentialsInput = {
  gsp_provider: string;
  auth_url: string;
  generate_url: string;
  cancel_url: string;
  gsp_username?: string | null;
  gsp_password?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
};

/** Ported from stockpilot-ai-ops's `saveEinvoiceCredentials` mutation -- see
 * eway-bill/mutations.ts's own docstring for why this is a plain upsert, and for why
 * `gsp_password`/`client_secret` are encrypted here the same way BYOK encrypts
 * `discovery.ai_provider_credentials.encrypted_api_key`. */
export async function upsertEinvoiceCredentials(
  businessId: string,
  input: EinvoiceCredentialsInput,
): Promise<void> {
  await requireModule(businessId, "gst");
  const supabase = await createClient();
  const { error } = await supabase.from("einvoice_credentials").upsert({
    business_id: businessId,
    gsp_provider: input.gsp_provider,
    auth_url: input.auth_url,
    generate_url: input.generate_url,
    cancel_url: input.cancel_url,
    gsp_username: input.gsp_username || null,
    encrypted_gsp_password: input.gsp_password ? encryptApiKey(input.gsp_password) : null,
    client_id: input.client_id || null,
    encrypted_client_secret: input.client_secret ? encryptApiKey(input.client_secret) : null,
  });
  if (error) throw error;
}

/**
 * S-2's own "generate an e-invoice/IRN" workflow -- runs entirely via the admin client:
 * `gst.einvoice_credentials` has no SELECT grant to `authenticated` at all (its own
 * migration's own lockdown), so reading a business's GSP secrets to actually call its
 * `generate_url` can only happen through `service_role`, regardless of who triggered
 * this call -- an interactive "Generate" button (gated by
 * `requirePermission(businessId, 'gst.generate')` at the server-action layer) or the
 * `document.issued` domain-event consumer (events/handlers.ts), which has no signed-in
 * user at all. Idempotent: a document that already has a row here (any status) is
 * returned as-is rather than calling the GSP a second time, matching this table's own
 * "one row per document, ever" design (`unique(document_id)`).
 *
 * The request/response field names below (DocDtls/ValDtls on the way in, Irn/AckNo/
 * AckDt/SignedQRCode on the way back) are the real NIC e-invoice (IRP) API shape, not
 * an invented one -- grounded in the actual integration even though, same as every
 * Resend email send elsewhere in this platform, this was never exercised against a
 * live GSP sandbox in this session (none is reachable, and no demo business here has
 * real GSP credentials to test against). Only the fields this schema actually stores
 * are sent -- not a fully IRP-compliant payload (seller/buyer GSTIN, item lines, etc.),
 * a deliberate simplification documented alongside this story.
 *
 * Deliberately does NOT call `requireModule()` (unlike `upsertEinvoiceCredentials` above)
 * -- it and `cancelEinvoice` below are reachable from the `document.issued` event
 * consumer, drained by a Vercel Cron hitting `/api/cron/drain-events` with only a bearer
 * secret, no signed-in user. `requireModule()` goes through the request-scoped,
 * cookie-based `createClient()`, and `core.has_module_write()` is revoked from `anon` --
 * calling it here would throw on every cron-driven invocation and silently break
 * automatic e-invoice generation. The interactive "Generate"/"Cancel" callers already
 * check `hasModule()` themselves in `contract/index.ts`'s `requireLicensed()`.
 */
export async function generateEinvoice(businessId: string, documentId: string): Promise<Einvoice> {
  const admin = createAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("einvoices")
    .select("*")
    .eq("business_id", businessId)
    .eq("document_id", documentId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const { data: credentials, error: credentialsError } = await admin
    .from("einvoice_credentials")
    .select("generate_url, gsp_username, encrypted_gsp_password, client_id, encrypted_client_secret")
    .eq("business_id", businessId)
    .maybeSingle();
  if (credentialsError) throw credentialsError;
  if (!credentials) throw new Error("No e-Invoicing credentials configured for this business.");

  const core = createCoreAdminClient({ schema: "core" });
  const { data: document, error: documentError } = await core
    .from("documents")
    .select("number, subtotal, cgst_amount, sgst_amount, igst_amount, total_amount, doc_date")
    .eq("id", documentId)
    .eq("business_id", businessId)
    .single();
  if (documentError) throw documentError;

  const response = await callGsp(credentials.generate_url, decryptGspSecrets(credentials), {
    DocDtls: { No: document.number, Dt: document.doc_date },
    ValDtls: {
      AssVal: document.subtotal,
      CgstVal: document.cgst_amount,
      SgstVal: document.sgst_amount,
      IgstVal: document.igst_amount,
      TotInvVal: document.total_amount,
    },
  });

  const { data: row, error: insertError } = await admin
    .from("einvoices")
    .insert({
      business_id: businessId,
      document_id: documentId,
      irn: (response.Irn as string | undefined) ?? null,
      ack_no: (response.AckNo as string | undefined) ?? null,
      ack_date: (response.AckDt as string | undefined) ?? null,
      qr_code: (response.SignedQRCode as string | undefined) ?? null,
    })
    .select()
    .single();
  if (insertError) throw insertError;
  return row;
}

/** Cancels a previously generated e-invoice (real IRN cancellation is only valid within
 * 24 hours of generation per GST rules -- not enforced here, same as this schema not
 * modeling reissue: a GSP that rejects a late cancellation surfaces as an ordinary
 * `callGsp` error). Idempotent: cancelling an already-cancelled row just returns it. */
export async function cancelEinvoice(businessId: string, documentId: string, reason?: string): Promise<Einvoice> {
  const admin = createAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("einvoices")
    .select("*")
    .eq("business_id", businessId)
    .eq("document_id", documentId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error("No e-Invoice exists for this document.");
  if (existing.status === "cancelled") return existing;

  const { data: credentials, error: credentialsError } = await admin
    .from("einvoice_credentials")
    .select("cancel_url, gsp_username, encrypted_gsp_password, client_id, encrypted_client_secret")
    .eq("business_id", businessId)
    .maybeSingle();
  if (credentialsError) throw credentialsError;
  if (!credentials) throw new Error("No e-Invoicing credentials configured for this business.");

  await callGsp(credentials.cancel_url, decryptGspSecrets(credentials), {
    Irn: existing.irn,
    CnlRsn: "1",
    CnlRem: reason || "Cancelled",
  });

  const { data: row, error: updateError } = await admin
    .from("einvoices")
    .update({ status: "cancelled", cancel_reason: reason ?? null, cancelled_at: new Date().toISOString() })
    .eq("id", existing.id)
    .select()
    .single();
  if (updateError) throw updateError;
  return row;
}
