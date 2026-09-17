import { agingBucket, documentBalance, type AgingBucket, type AgingSummary, type PaymentStatus } from "./aging";

/**
 * Turning documents, payments and credit notes into a receivables ledger.
 *
 * Finance owns none of these: invoices and credit notes are `core.documents`, money is
 * `core.payments` + `core.payment_allocations`. This file derives what is still owed from
 * rows that already exist rather than keeping a second copy of them in step.
 */

export interface ReceivableDocument {
  id: string;
  doc_type: string;
  number: string | null;
  status: string;
  party_id: string;
  doc_date: string;
  due_date: string | null;
  total_amount: number;
  source_ref: Record<string, unknown> | null;
}

export interface OpenReceivable {
  id: string;
  number: string | null;
  partyId: string;
  partyName: string;
  docDate: string;
  dueDate: string | null;
  total: number;
  /** Credit notes raised against this invoice, which reduce what is owed without money
   * moving. */
  credited: number;
  paid: number;
  outstanding: number;
  status: PaymentStatus;
  bucket: AgingBucket;
}

/**
 * Which invoice a credit note was raised against.
 *
 * Two keys, because the two modules that raise credit notes chose different names for
 * the same link: Service writes `source_ref.invoice_id`
 * (`module-fsm/lib/invoices/mutations.ts#voidInvoiceViaCreditNote`) and Inventory writes
 * `source_ref.sales_invoice_id` (`inventory.create_credit_note()`). Reading only one of
 * them would silently overstate receivables for whichever module the reader forgot —
 * which is exactly the kind of quiet wrongness a receivables report must not have.
 *
 * Flagged rather than reconciled: unifying the key is a change to two other modules'
 * data, not Finance's to make.
 */
export function creditedInvoiceId(sourceRef: Record<string, unknown> | null): string | null {
  if (!sourceRef) return null;
  const candidate = sourceRef.invoice_id ?? sourceRef.sales_invoice_id;
  return typeof candidate === "string" ? candidate : null;
}

/** Document types that put money on a customer's account. A debit note adds to what is
 * owed, which is why it sits alongside invoices rather than with credit notes. */
const RECEIVABLE_DOC_TYPES = new Set(["invoice", "debit_note"]);

/** Statuses that take a document out of the receivables ledger entirely: a draft was
 * never issued, and a voided or cancelled one is no longer owed. A voided invoice is
 * offset by its own credit note in the ledger, but it must not also be chased. */
const NOT_OWED_STATUSES = new Set(["draft", "cancelled", "voided"]);

export function isReceivable(document: ReceivableDocument): boolean {
  return RECEIVABLE_DOC_TYPES.has(document.doc_type) && !NOT_OWED_STATUSES.has(document.status);
}

/**
 * The open receivables, one row per document that still owes something.
 *
 * Fully settled documents are dropped rather than listed at zero: a receivables screen
 * is a list of what to chase, and every paid invoice ever raised would bury it.
 */
export function buildOpenReceivables(
  documents: ReceivableDocument[],
  allocatedByDocument: Map<string, number>,
  creditedByDocument: Map<string, number>,
  partyNames: Map<string, string>,
  asOf: Date,
): OpenReceivable[] {
  const open: OpenReceivable[] = [];

  for (const document of documents) {
    if (!isReceivable(document)) continue;
    const total = Number(document.total_amount ?? 0);
    const credited = creditedByDocument.get(document.id) ?? 0;
    const paid = allocatedByDocument.get(document.id) ?? 0;
    const balance = documentBalance(total, paid, credited);
    if (balance.outstanding <= 0) continue;

    open.push({
      id: document.id,
      number: document.number,
      partyId: document.party_id,
      partyName: partyNames.get(document.party_id) ?? "Unknown customer",
      docDate: document.doc_date,
      dueDate: document.due_date,
      total,
      credited,
      paid,
      outstanding: balance.outstanding,
      status: balance.status,
      bucket: agingBucket(document.due_date, asOf),
    });
  }

  // Oldest due date first: the top of this list is what to chase today. An invoice with
  // no due date sorts to the end — there is nothing to be late against.
  return open.sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31"));
}

export interface PartyAging {
  partyId: string;
  partyName: string;
  buckets: Record<AgingBucket, number>;
  total: number;
  count: number;
}

/** The same aging, per customer — the view that answers "who owes us the most, and how
 * late are they?", which is the question the total alone never answers. */
export function agingByParty(items: OpenReceivable[]): PartyAging[] {
  const byParty = new Map<string, OpenReceivable[]>();
  for (const item of items) {
    byParty.set(item.partyId, [...(byParty.get(item.partyId) ?? []), item]);
  }

  return [...byParty.entries()]
    .map(([partyId, partyItems]) => {
      // Each item's own bucket is the authority — re-deriving it here against a fresh
      // "now" would let the summary put an invoice in a different bucket than the row
      // above it, on the same screen.
      const buckets: Record<AgingBucket, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
      for (const item of partyItems) buckets[item.bucket] += item.outstanding;

      return {
        partyId,
        partyName: partyItems[0]!.partyName,
        buckets,
        total: Math.round(partyItems.reduce((s, i) => s + i.outstanding, 0) * 100) / 100,
        count: partyItems.length,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** Totals across every open item, using each item's own already-decided bucket. */
export function summariseReceivables(items: OpenReceivable[]): AgingSummary {
  const buckets: Record<AgingBucket, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const item of items) buckets[item.bucket] += item.outstanding;

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const total = Object.values(buckets).reduce((s, v) => s + v, 0);
  return {
    buckets: Object.fromEntries(
      Object.entries(buckets).map(([k, v]) => [k, round2(v)]),
    ) as Record<AgingBucket, number>,
    totalOutstanding: round2(total),
    overdue: round2(total - buckets.current),
    notYetDue: round2(buckets.current),
    count: items.length,
  };
}
