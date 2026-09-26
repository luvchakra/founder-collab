import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { explainDocumentPostings, unpostedReason, type DocumentPostingSummary } from "./document-postings";
import { listJournalEntriesForDocument } from "./journal-queries";
import type { PostableDocument } from "./document-events";

export interface SourceDocument extends PostableDocument {
  number: string | null;
  partyName: string | null;
}

export interface DocumentLedger {
  document: SourceDocument;
  summary: DocumentPostingSummary;
  /** Set only when nothing has posted: why not, in words. */
  unpostedReason: string | null;
}

const DOCUMENT_COLUMNS =
  "id, doc_type, number, source_module, source_ref, party_id, doc_date, status, subtotal, discount_amount, shipping_amount, cgst_amount, sgst_amount, igst_amount, total_amount";

/**
 * FIN-12: a source document and every ledger entry it caused.
 *
 * The document is read from `core.documents` directly — canonical shared data, ADR-5's
 * first mechanism — so this works for an invoice from Service, Inventory or a bill typed
 * into Finance alike. The `businessId` filter is explicit as well as RLS's job: a
 * document id comes from the URL, and "someone else's document" must read as not found.
 */
export const getDocumentLedger = cache(
  async (businessId: string, documentId: string): Promise<DocumentLedger | null> => {
    const core = await createCoreClient({ schema: "core" });
    const { data, error } = await core
      .from("documents")
      .select(DOCUMENT_COLUMNS)
      .eq("business_id", businessId)
      .eq("id", documentId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const row = data as unknown as PostableDocument & { number: string | null };
    const [entries, party] = await Promise.all([
      listJournalEntriesForDocument(businessId, documentId),
      row.party_id
        ? core.from("parties").select("name").eq("business_id", businessId).eq("id", row.party_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (party.error) throw party.error;

    const summary = explainDocumentPostings(entries);
    return {
      document: { ...row, partyName: (party.data as { name: string } | null)?.name ?? null },
      summary,
      unpostedReason: summary.status === "not_posted" ? unpostedReason(row) : null,
    };
  },
);
