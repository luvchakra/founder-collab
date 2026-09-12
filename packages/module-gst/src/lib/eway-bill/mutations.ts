import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { encryptApiKey } from "@cofounderai/core/crypto/api-key";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";
import { createAdminClient } from "../../db/admin";
import { decryptGspSecrets } from "../gsp-client";
import { createGspEwayBillAdapter } from "../eway-bill-adapter/gsp-adapter";
import type {
  EwayBillExtendRequest,
  EwayBillExtendResponse,
  EwayBillStatusResponse,
  EwayBillUpdateVehicleRequest,
  EwayBillUpdateVehicleResponse,
} from "../eway-bill-adapter/types";
import type { EwayBill } from "./types";

export type EwayBillCredentialsInput = {
  gsp_provider: string;
  auth_url: string;
  generate_url: string;
  cancel_url: string;
  /** COMPLY-P0-06.3 (E-Way Adapter): optional -- a business already using the existing
   * generate/cancel workflow isn't forced to configure these before that keeps working. */
  vehicle_update_url?: string | null;
  extend_url?: string | null;
  status_url?: string | null;
  gsp_username?: string | null;
  gsp_password?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
};

const CREDENTIALS_COLUMNS =
  "generate_url, cancel_url, vehicle_update_url, extend_url, status_url, gsp_username, encrypted_gsp_password, client_id, encrypted_client_secret";

/** Reads a business's e-Way Bill credentials (admin client -- no SELECT grant to
 * `authenticated` exists on this table at all) and builds the formal `EwayBillAdapter`
 * this module's own generate/cancel/update/extend/status callers all share, instead of
 * each repeating the same read + `createGspEwayBillAdapter(...)` construction. */
async function loadEwayBillAdapter(businessId: string) {
  const admin = createAdminClient();
  const { data: credentials, error } = await admin
    .from("eway_bill_credentials")
    .select(CREDENTIALS_COLUMNS)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  if (!credentials) throw new Error("No e-Way Bill credentials configured for this business.");

  return createGspEwayBillAdapter(
    {
      generateUrl: credentials.generate_url,
      cancelUrl: credentials.cancel_url,
      vehicleUpdateUrl: credentials.vehicle_update_url,
      extendUrl: credentials.extend_url,
      statusUrl: credentials.status_url,
    },
    decryptGspSecrets(credentials),
  );
}

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
    vehicle_update_url: input.vehicle_update_url || null,
    extend_url: input.extend_url || null,
    status_url: input.status_url || null,
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
 * design. COMPLY-P0-06.3 (E-Way Adapter) refactored this to go through
 * `loadEwayBillAdapter()`/`EwayBillAdapter.generate()` instead of calling `callGsp`
 * inline -- same request/response mapping as before, now formalized behind the adapter
 * interface, matching exactly how COMPLY-P0-05.3 refactored `generateEinvoice`.
 *
 * Deliberately simplified vs. a real NIC e-way-bill API call: only docNo/docDate/
 * totalValue are sent -- consignor/consignee/transport/vehicle/distance details
 * (COMPLY-P0-06.2's own `gst.eway_bill_movements`) are NOT wired into this payload yet.
 * Deciding how/whether to feed that movement data into generation (and whether to gate
 * generation on COMPLY-P0-06.1's own eligibility determination) is deliberately left to
 * COMPLY-P0-06.4 ("Document Link"), the story that ties eligibility + movement data +
 * this adapter + the source document together -- not implied by this story's own,
 * narrower "formalize generate/cancel, add update/extend/status" scope. This is also why
 * S-2's own UI still only offers e-way-bill generation as a manual action, never
 * auto-triggered by `document.issued` the way `generateEinvoice` is.
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

  const adapter = await loadEwayBillAdapter(businessId);

  const core = createCoreAdminClient({ schema: "core" });
  const { data: document, error: documentError } = await core
    .from("documents")
    .select("number, total_amount, doc_date")
    .eq("id", documentId)
    .eq("business_id", businessId)
    .single();
  if (documentError) throw documentError;

  const response = await adapter.generate({ docNumber: document.number, docDate: document.doc_date, totalValue: document.total_amount });

  const { data: row, error: insertError } = await admin
    .from("eway_bills")
    .insert({
      business_id: businessId,
      document_id: documentId,
      eway_bill_number: response.ewbNo,
      valid_until: response.validUpto,
      qr_code: response.qrCode,
    })
    .select()
    .single();
  if (insertError) throw insertError;
  return row;
}

/** Cancels a previously generated e-way bill (real cancellation is only valid within 24
 * hours of generation -- not enforced here, same reasoning as `cancelEinvoice`).
 * Idempotent: cancelling an already-cancelled row just returns it. COMPLY-P0-06.3
 * refactored this to go through the adapter's own `cancel()`, same request shape as
 * before. */
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
  if (!existing.eway_bill_number) throw new Error("This e-Way Bill has no e-way bill number on record to cancel.");

  const adapter = await loadEwayBillAdapter(businessId);
  await adapter.cancel({ ewbNo: existing.eway_bill_number, cancelRsnCode: "1", cancelRmrk: reason || "Cancelled" });

  const { data: row, error: updateError } = await admin
    .from("eway_bills")
    .update({ status: "cancelled", cancel_reason: reason ?? null, cancelled_at: new Date().toISOString() })
    .eq("id", existing.id)
    .select()
    .single();
  if (updateError) throw updateError;
  return row;
}

/** Looks up the `gst.eway_bills` row for a document that has an e-way bill NUMBER on
 * record (whether still active or already cancelled) -- the bare precondition
 * `getEwayBillNicStatus` needs, since checking a government system's own live status is
 * meaningful even for a bill this platform's own row already knows was cancelled. */
async function requireEwayBillNumber(businessId: string, documentId: string) {
  const admin = createAdminClient();
  const { data: existing, error } = await admin
    .from("eway_bills")
    .select("*")
    .eq("business_id", businessId)
    .eq("document_id", documentId)
    .maybeSingle();
  if (error) throw error;
  if (!existing) throw new Error("No e-Way Bill exists for this document.");
  if (!existing.eway_bill_number) throw new Error("This e-Way Bill has no e-way bill number on record.");
  return existing;
}

/** Same as `requireEwayBillNumber`, plus refuses an already-cancelled bill -- the
 * precondition `updateEwayBillVehicle`/`extendEwayBill` both need, since a real GSP
 * would itself reject a Part-B update or validity extension against a cancelled e-way
 * bill. */
async function requireActiveEwayBill(businessId: string, documentId: string) {
  const existing = await requireEwayBillNumber(businessId, documentId);
  if (existing.status === "cancelled") throw new Error("This e-Way Bill has been cancelled.");
  return existing;
}

/**
 * COMPLY-P0-06.3 (E-Way Adapter): the first real caller of the adapter's own
 * `updateVehicle()` method (VEHEWB, "Update Part-B") -- a genuinely new capability this
 * module never had a way to invoke before. Deliberately does NOT also update
 * `gst.eway_bill_movements.vehicle_number` (COMPLY-P0-06.2's own table) to mirror the new
 * vehicle -- reconciling this adapter's own government-facing actions with that separate
 * table's own draft/preparatory data is COMPLY-P0-06.4's ("Document Link") job, once it
 * decides how the two are meant to relate; this function only proves the adapter's
 * `updateVehicle` method is real and callable end to end, same posture COMPLY-P0-05.3's
 * own `getEinvoiceIrpStatus` took for its own new capability.
 */
export async function updateEwayBillVehicle(
  businessId: string,
  documentId: string,
  input: Omit<EwayBillUpdateVehicleRequest, "ewbNo">,
): Promise<EwayBillUpdateVehicleResponse> {
  const existing = await requireActiveEwayBill(businessId, documentId);
  const adapter = await loadEwayBillAdapter(businessId);
  return adapter.updateVehicle({ ewbNo: existing.eway_bill_number as string, ...input });
}

/**
 * COMPLY-P0-06.3 (E-Way Adapter): the first real caller of the adapter's own `extend()`
 * method (ExtendEWB) -- another genuinely new capability. Unlike `updateEwayBillVehicle`
 * above, this DOES persist its one directly-relevant result (`validUpto`) back onto the
 * same `gst.eway_bills.valid_until` column `generateEwayBill` itself already populates --
 * a minimal, non-speculative continuation of what this same mutation file already owns
 * (the exact same table/column, not a new cross-table sync decision), the same way
 * `cancelEwayBill` already updates that row's own `status`/`cancelled_at` after a real
 * government action succeeds. Only persists when the government response actually
 * included a new `validUpto` -- never overwrites the existing value with a guess.
 */
export async function extendEwayBill(
  businessId: string,
  documentId: string,
  input: Omit<EwayBillExtendRequest, "ewbNo">,
): Promise<EwayBillExtendResponse> {
  const existing = await requireActiveEwayBill(businessId, documentId);
  const adapter = await loadEwayBillAdapter(businessId);
  const response = await adapter.extend({ ewbNo: existing.eway_bill_number as string, ...input });

  if (response.validUpto) {
    const admin = createAdminClient();
    const { error } = await admin.from("eway_bills").update({ valid_until: response.validUpto }).eq("id", existing.id);
    if (error) throw error;
  }

  return response;
}

/**
 * COMPLY-P0-06.3 (E-Way Adapter): the first real caller of the adapter's own `status()`
 * method (GetEwayBill) -- deliberately read-only and NOT persisted anywhere, same
 * reasoning as `getEinvoiceIrpStatus` (COMPLY-P0-05.3): deciding how a live status answer
 * should update `gst.eway_bills`' own `status` column, or a fuller state machine, is a
 * future story's job, not this one's.
 */
export async function getEwayBillNicStatus(businessId: string, documentId: string): Promise<EwayBillStatusResponse> {
  const existing = await requireEwayBillNumber(businessId, documentId);
  const adapter = await loadEwayBillAdapter(businessId);
  return adapter.status({ ewbNo: existing.eway_bill_number as string });
}
