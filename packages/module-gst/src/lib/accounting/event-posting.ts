import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import {
  financeEventFromAllocation,
  financeEventFromDocument,
  type PostableDocument,
} from "./document-events";
import { postFinanceEvent, type PostFinanceEventResult } from "./journal-mutations";

const DOCUMENT_COLUMNS =
  "id, doc_type, source_module, party_id, doc_date, status, subtotal, discount_amount, shipping_amount, cgst_amount, sgst_amount, igst_amount, total_amount, source_ref";

/**
 * Posts the ledger entry for a document another module just issued.
 *
 * Reads `core.documents` directly — cross-module shared data, the first and least-coupled
 * of ADR-5's three mechanisms — rather than calling into Service's or Inventory's own
 * invoice code. An invoice is an invoice whichever module raised it, and Finance would
 * otherwise need a branch per module for a row that is already canonical.
 *
 * Service-role, because this runs from the domain-event drain where there is no session.
 * The `businessId` comes from the event row, and the document read is scoped to it, so a
 * document belonging to another business is simply not found.
 *
 * Every outcome is a returned value, never a throw: "nothing to post" is the normal case
 * for most documents, and the drain retries anything that throws, which would be wrong
 * for a document that will never be postable.
 */
export async function postIssuedDocument(
  businessId: string,
  documentId: string,
  sourceEventId?: string | null,
): Promise<PostFinanceEventResult> {
  const core = createCoreAdminClient({ schema: "core" });
  const { data, error } = await core
    .from("documents")
    .select(DOCUMENT_COLUMNS)
    .eq("business_id", businessId)
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { posted: false, reason: "No such document for this business." };

  const event = financeEventFromDocument(data as unknown as PostableDocument, { sourceEventId });
  if (!event) {
    return { posted: false, reason: "This document has no accounting consequence." };
  }

  return postFinanceEvent(businessId, { ...event, businessId });
}

/**
 * Posts the ledger entry for one payment allocation.
 *
 * Reads `core.payments`, `core.payment_allocations` and `core.documents` directly — all
 * three are canonical shared data, and a payment is a payment whichever module recorded
 * it. Service-role for the same reason as `postIssuedDocument`: this runs from the drain,
 * where there is no session.
 */
export async function postPaymentAllocation(
  businessId: string,
  allocationId: string,
  sourceEventId?: string | null,
): Promise<PostFinanceEventResult> {
  const core = createCoreAdminClient({ schema: "core" });
  const { data, error } = await core
    .from("payment_allocations")
    .select("id, amount, document_id, payments(payment_date, method, party_id), documents(doc_type)")
    .eq("business_id", businessId)
    .eq("id", allocationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { posted: false, reason: "No such payment allocation for this business." };

  type Row = {
    id: string;
    amount: number;
    document_id: string;
    payments: { payment_date: string; method: string | null; party_id: string | null } | null;
    documents: { doc_type: string } | null;
  };
  const row = data as unknown as Row;
  if (!row.payments || !row.documents) {
    return { posted: false, reason: "This allocation is missing its payment or its document." };
  }

  const event = financeEventFromAllocation(
    {
      allocationId: row.id,
      amount: Number(row.amount ?? 0),
      paymentDate: row.payments.payment_date,
      method: row.payments.method,
      reference: null,
      partyId: row.payments.party_id,
      docType: row.documents.doc_type,
      documentId: row.document_id,
    },
    { sourceEventId },
  );
  if (!event) {
    return { posted: false, reason: "This payment doesn't settle anything the ledger tracks." };
  }

  return postFinanceEvent(businessId, { ...event, businessId });
}
