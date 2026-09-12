import { cache } from "react";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createClient } from "../../db/server";
import type { InvoiceNowSubmitResponse } from "./types";
import type { InvoiceNowTransmission, InvoiceNowTransmissionStatus } from "./types";

/**
 * COMPLY-P1-04.5/04.6 (InvoiceNow Adapter / Transmission Status): the persisted
 * counterpart to `InvoiceNowAdapter` -- records what an actual submission attempt
 * returned (or, until a real Access Point provider is configured, what a human reports
 * happened via an external InvoiceNow-ready solution -- the same "record-what-happened,
 * never automate a live call this session cannot make" posture COMPLY-P1-03.5's own CRA
 * Filing Adapter already established for a different regime with no reachable government
 * API). Idempotent, matching `gst.einvoices`' own "one row per document, ever" shape: a
 * document that already has a row is returned as-is, never overwritten by a second
 * `recordInvoiceNowTransmission` call -- a resubmission needs a real, separate business
 * decision this function does not make on its own.
 */
export async function recordInvoiceNowTransmission(
  businessId: string,
  documentId: string,
  result: Pick<InvoiceNowSubmitResponse, "peppolMessageId" | "irasSubmissionId" | "raw"> & {
    buyerPeppolId: string;
    status: InvoiceNowTransmissionStatus;
    rejectedReason?: string | null;
  },
): Promise<InvoiceNowTransmission> {
  await requirePermission(businessId, "gst.generate");
  const supabase = await createClient();

  const existing = await getInvoiceNowTransmission(businessId, documentId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("invoicenow_transmissions")
    .insert({
      business_id: businessId,
      document_id: documentId,
      status: result.status,
      peppol_message_id: result.peppolMessageId,
      buyer_peppol_id: result.buyerPeppolId,
      iras_submission_id: result.irasSubmissionId,
      rejected_reason: result.rejectedReason ?? null,
      raw_response: result.raw,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/**
 * Updates an already-recorded transmission's own status -- the counterpart to
 * `InvoiceNowAdapter.status()` polling a Peppol Access Point/IRAS for a delivery outcome
 * that was not yet known at submission time (`"sent"` -> `"delivered"`/`"rejected"`/
 * `"failed"`). Never widens scope to change `peppol_message_id`/`buyer_peppol_id` --
 * those are set once, at recording time, and are immutable facts about the original
 * submission.
 */
export async function updateInvoiceNowTransmissionStatus(
  businessId: string,
  documentId: string,
  status: InvoiceNowTransmissionStatus,
  rejectedReason?: string | null,
): Promise<InvoiceNowTransmission> {
  await requirePermission(businessId, "gst.generate");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoicenow_transmissions")
    .update({ status, rejected_reason: rejectedReason ?? null })
    .eq("business_id", businessId)
    .eq("document_id", documentId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export const getInvoiceNowTransmission = cache(
  async (businessId: string, documentId: string): Promise<InvoiceNowTransmission | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("invoicenow_transmissions")
      .select("*")
      .eq("business_id", businessId)
      .eq("document_id", documentId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
);
