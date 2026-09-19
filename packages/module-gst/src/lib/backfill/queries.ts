import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createClient } from "../../db/server";
import { listUnpostedDocuments, type UnpostedDocument } from "../accounting/dashboard-queries";
import type { BackfillCandidate, BackfillScan } from "./types";

/** Full-history scan, not the dashboard notice's recent-only 50 -- a backfill exists
 * specifically to catch everything that predates Finance being licensed, which for a
 * business with real history is exactly the documents a 50-row window would miss. High
 * enough that no real business's history hits it; a paginated scan is a genuine future
 * need this doesn't build ahead of it actually mattering. */
const BACKFILL_SCAN_LIMIT = 5000;

const DOC_TYPE_LABEL: Record<string, string> = {
  invoice: "Invoice",
  credit_note: "Credit note",
  debit_note: "Debit note",
  sales_return: "Sales return",
  supplier_bill: "Bill",
  supplier_credit: "Supplier credit",
};

function documentLabel(doc: UnpostedDocument): string {
  const kind = DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type;
  return doc.number ? `${kind} ${doc.number}` : `${kind} (${doc.id.slice(0, 8)})`;
}

/** Settleable document types a payment allocation can post against -- mirrors
 * `SETTLEABLE_DOC_TYPES` in `document-events.ts`, which is the actual authority on whether
 * an allocation has an accounting consequence; this list only needs to be wide enough not
 * to under-scan, `financeEventFromAllocation` makes the real call at post time. */
const SETTLEABLE_DOC_TYPES = ["invoice", "debit_note", "purchase_order", "supplier_bill"];

type AllocationRow = {
  id: string;
  document_id: string;
  documents: { doc_type: string; number: string | null } | { doc_type: string; number: string | null }[] | null;
};

function oneDocument(documents: AllocationRow["documents"]): { doc_type: string; number: string | null } | null {
  if (!documents) return null;
  return Array.isArray(documents) ? (documents[0] ?? null) : documents;
}

/** Payment allocations that settle something postable and have no ledger entry of their
 * own yet -- posted separately from documents because an allocation's own identity
 * (`gst.journal_entries.source_entity_id`), not the document it settles, is what makes a
 * partial payment split three ways three independent postings. */
async function listUnpostedPaymentAllocations(businessId: string, limit: number): Promise<BackfillCandidate[]> {
  const core = await createCoreClient({ schema: "core" });
  const { data: allocations, error } = await core
    .from("payment_allocations")
    .select("id, document_id, documents!inner(doc_type, number)")
    .eq("business_id", businessId)
    .in("documents.doc_type", SETTLEABLE_DOC_TYPES)
    .limit(limit);
  if (error) throw error;

  const candidates = (allocations ?? [])
    .map((row) => {
      const document = oneDocument((row as unknown as AllocationRow).documents);
      return document ? { id: row.id as string, documentId: row.document_id as string, document } : null;
    })
    .filter((row): row is { id: string; documentId: string; document: { doc_type: string; number: string | null } } => row !== null);
  if (candidates.length === 0) return [];

  const gst = await createClient();
  const { data: posted, error: postedError } = await gst
    .from("journal_entries")
    .select("source_entity_id")
    .eq("business_id", businessId)
    .in(
      "source_entity_id",
      candidates.map((c) => c.id),
    );
  if (postedError) throw postedError;

  const postedIds = new Set((posted ?? []).map((row: { source_entity_id: string | null }) => row.source_entity_id));

  return candidates
    .filter((c) => !postedIds.has(c.id))
    .map((c) => ({
      kind: "payment_allocation" as const,
      id: c.id,
      documentId: c.documentId,
      label: `Payment on ${DOC_TYPE_LABEL[c.document.doc_type] ?? c.document.doc_type} ${c.document.number ?? ""}`.trim(),
    }));
}

/** The full backfill scan: everything with an accounting consequence that hasn't reached
 * the ledger yet, across both sources §41 names. */
export async function scanFinanceBackfill(businessId: string): Promise<BackfillScan> {
  const [unpostedDocuments, unpostedAllocations] = await Promise.all([
    listUnpostedDocuments(businessId, BACKFILL_SCAN_LIMIT),
    listUnpostedPaymentAllocations(businessId, BACKFILL_SCAN_LIMIT),
  ]);

  return {
    documents: unpostedDocuments.map((doc) => ({
      kind: "document" as const,
      id: doc.id,
      documentId: doc.id,
      label: documentLabel(doc),
    })),
    paymentAllocations: unpostedAllocations,
  };
}
