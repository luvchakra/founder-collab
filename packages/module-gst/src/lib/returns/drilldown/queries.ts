import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { computeMissingDocumentIds } from "./reconcile";
import type { ReturnDrillDown, ReturnSourceDocument } from "./types";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/**
 * COMPLY-P0-07.4 (Return Drill-Down): given any return row's own `documentId`/
 * `documentIds`, fetch the REAL `core.documents` rows behind it. `businessId` is enforced
 * explicitly here (`eq("business_id", ...)`, not left to RLS alone) so a document id that
 * doesn't actually belong to the business a caller claims it does for is never silently
 * treated as if it did -- the same "never trust a client-supplied id without server-side
 * authorization" discipline this platform's own CLAUDE.md requires everywhere else
 * (development principle 8), applied here to a document id embedded in an already-computed
 * return row rather than a raw request parameter, which deserves exactly the same
 * suspicion. A stale or wrong-business id doesn't error -- it surfaces in
 * `missingDocumentIds` (never silently dropped, backlog rule 11/12), since a genuinely
 * complete drill-down means showing what's real and flagging what isn't, not failing the
 * whole request over one bad id.
 *
 * Batched the same way every other read in this epic already is (`resolveOutwardDocuments`,
 * `getPurchaseRegister`): one `.in()` query per related table, not N one-document-at-a-time
 * calls.
 */
export async function getReturnRowSourceDocuments(businessId: string, documentIds: string[]): Promise<ReturnDrillDown> {
  const requestedDocumentIds = [...new Set(documentIds)];
  if (requestedDocumentIds.length === 0) {
    return { requestedDocumentIds: [], documents: [], missingDocumentIds: [] };
  }

  const core = await coreClient();
  const { data: docs, error } = await core
    .from("documents")
    .select("id, doc_type, number, doc_date, party_id, subtotal, cgst_amount, sgst_amount, igst_amount, total_amount")
    .eq("business_id", businessId)
    .in("id", requestedDocumentIds);
  if (error) throw error;

  const partyIds = [...new Set(docs.map((d) => d.party_id).filter((id): id is string => !!id))];
  const { data: parties, error: partiesError } = partyIds.length
    ? await core.from("parties").select("id, name").in("id", partyIds)
    : { data: [] as { id: string; name: string }[], error: null };
  if (partiesError) throw partiesError;
  const partyNameById = new Map(parties.map((p) => [p.id as string, p.name as string]));

  const documents: ReturnSourceDocument[] = docs.map((d) => ({
    documentId: d.id,
    docType: d.doc_type as ReturnSourceDocument["docType"],
    number: d.number,
    docDate: d.doc_date,
    partyName: (d.party_id && partyNameById.get(d.party_id)) || "Unknown party",
    taxableValue: Number(d.subtotal),
    cgstAmount: Number(d.cgst_amount),
    sgstAmount: Number(d.sgst_amount),
    igstAmount: Number(d.igst_amount),
    invoiceValue: Number(d.total_amount),
  }));

  return {
    requestedDocumentIds,
    documents,
    missingDocumentIds: computeMissingDocumentIds(
      requestedDocumentIds,
      docs.map((d) => d.id as string),
    ),
  };
}
