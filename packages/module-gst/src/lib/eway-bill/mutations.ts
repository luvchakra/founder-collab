import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { encryptApiKey } from "@cofounderai/core/crypto/api-key";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";
import { createAdminClient } from "../../db/admin";
import { callGsp, decryptGspSecrets } from "../gsp-client";
import type { EwayBill } from "./types";

export type EwayBillCredentialsInput = {
  gsp_provider: string;
  auth_url: string;
  generate_url: string;
  cancel_url: string;
  gsp_username?: string | null;
  gsp_password?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
};

/** Ported from stockpilot-ai-ops's `saveEwayBillCredentials` mutation. Upsert, not
 * create-or-update branching -- `gst.eway_bill_credentials` is keyed by `business_id`
 * alone (one credential set per business), so re-saving always replaces the existing row
 * (RLS's UPDATE policy covers the "already configured" case, INSERT the first-time one,
 * and upsert picks whichever applies without the caller needing to know which).
 *
 * `gsp_password`/`client_secret` are encrypted here, the same AES-256-GCM helper BYOK
 * uses for `discovery.ai_provider_credentials.encrypted_api_key` -- these are real GSP
 * account secrets, not identifiers, and this table already has no SELECT grant to
 * `authenticated` at all (access control alone was the pre-2026-09-09 gap; this adds
 * the second layer). An empty string is treated the same as "not provided" -- never
 * encrypted into a stored empty ciphertext that would read as "configured" later.
 * `requireModule()` (defense in depth, CLAUDE.md's licensing architecture section) --
 * this module's demonstrated call site. */
export async function upsertEwayBillCredentials(
  businessId: string,
  input: EwayBillCredentialsInput,
): Promise<void> {
  await requireModule(businessId, "gst");
  const supabase = await createClient();
  const { error } = await supabase.from("eway_bill_credentials").upsert({
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
 * S-2's own "generate an e-way bill" workflow -- same admin-client-throughout reasoning
 * as `einvoicing/mutations.ts#generateEinvoice` (reading a GSP secret always requires
 * `service_role`, regardless of caller). Idempotent, same "one row per document, ever"
 * design.
 *
 * Deliberately simplified vs. a real NIC e-way-bill API call: the real request also
 * needs transport details (vehicle number, transporter id, distance) this schema has
 * nowhere to capture -- not modeled anywhere in `core.documents`/`fsm.jobs`/inventory's
 * own tables. Only invoice-value fields are sent; this is why S-2's own UI only ever
 * offers e-way-bill generation as a manual action, never auto-triggered by
 * `document.issued` the way `generateEinvoice` is (an e-way bill genuinely can't be
 * generated from an invoice alone in the real world either -- it needs the shipment,
 * which doesn't exist yet at the moment an invoice is issued).
 */
export async function generateEwayBill(businessId: string, documentId: string): Promise<EwayBill> {
  const admin = createAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("eway_bills")
    .select("*")
    .eq("business_id", businessId)
    .eq("document_id", documentId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const { data: credentials, error: credentialsError } = await admin
    .from("eway_bill_credentials")
    .select("generate_url, gsp_username, encrypted_gsp_password, client_id, encrypted_client_secret")
    .eq("business_id", businessId)
    .maybeSingle();
  if (credentialsError) throw credentialsError;
  if (!credentials) throw new Error("No e-Way Bill credentials configured for this business.");

  const core = createCoreAdminClient({ schema: "core" });
  const { data: document, error: documentError } = await core
    .from("documents")
    .select("number, total_amount, doc_date")
    .eq("id", documentId)
    .eq("business_id", businessId)
    .single();
  if (documentError) throw documentError;

  const response = await callGsp(credentials.generate_url, decryptGspSecrets(credentials), {
    docNo: document.number,
    docDate: document.doc_date,
    totalValue: document.total_amount,
  });

  const { data: row, error: insertError } = await admin
    .from("eway_bills")
    .insert({
      business_id: businessId,
      document_id: documentId,
      eway_bill_number: (response.ewbNo as string | undefined) ?? null,
      valid_until: (response.validUpto as string | undefined) ?? null,
      qr_code: (response.signedQRCode as string | undefined) ?? null,
    })
    .select()
    .single();
  if (insertError) throw insertError;
  return row;
}

/** Cancels a previously generated e-way bill (real cancellation is only valid within 24
 * hours of generation -- not enforced here, same reasoning as `cancelEinvoice`).
 * Idempotent: cancelling an already-cancelled row just returns it. */
export async function cancelEwayBill(businessId: string, documentId: string, reason?: string): Promise<EwayBill> {
  const admin = createAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("eway_bills")
    .select("*")
    .eq("business_id", businessId)
    .eq("document_id", documentId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) throw new Error("No e-Way Bill exists for this document.");
  if (existing.status === "cancelled") return existing;

  const { data: credentials, error: credentialsError } = await admin
    .from("eway_bill_credentials")
    .select("cancel_url, gsp_username, encrypted_gsp_password, client_id, encrypted_client_secret")
    .eq("business_id", businessId)
    .maybeSingle();
  if (credentialsError) throw credentialsError;
  if (!credentials) throw new Error("No e-Way Bill credentials configured for this business.");

  await callGsp(credentials.cancel_url, decryptGspSecrets(credentials), {
    ewbNo: existing.eway_bill_number,
    cancelRsnCode: "1",
    cancelRmrk: reason || "Cancelled",
  });

  const { data: row, error: updateError } = await admin
    .from("eway_bills")
    .update({ status: "cancelled", cancel_reason: reason ?? null, cancelled_at: new Date().toISOString() })
    .eq("id", existing.id)
    .select()
    .single();
  if (updateError) throw updateError;
  return row;
}
