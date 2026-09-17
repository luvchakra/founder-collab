import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { financeEventFromDocument, type PostableDocument } from "./document-events";
import { postFinanceEvent, type PostFinanceEventResult } from "./journal-mutations";

const DOCUMENT_COLUMNS =
  "id, doc_type, source_module, party_id, doc_date, status, subtotal, discount_amount, shipping_amount, cgst_amount, sgst_amount, igst_amount, total_amount";

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
