import { agingBucket, documentBalance, type AgingBucket, type AgingSummary, type PaymentStatus } from "./aging";

/**
 * What this business owes its suppliers, and how overdue it is.
 *
 * The mirror of `receivables.ts` and deliberately its own file rather than a shared
 * generic one: the two look alike but answer opposite questions. Receivables is a list of
 * who to chase; payables is a list of what to pay before it costs you a relationship or a
 * late fee. The sort order, the wording and what counts as a document differ, and a single
 * parameterised version would have to keep explaining which side it was on.
 */

export interface PayableDocument {
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

export interface OpenPayable {
  id: string;
  number: string | null;
  partyId: string;
  partyName: string;
  docDate: string;
  dueDate: string | null;
  total: number;
  /** Supplier credit notes against this bill, which reduce what is owed without money
   * moving. */
  credited: number;
  paid: number;
  outstanding: number;
  status: PaymentStatus;
  bucket: AgingBucket;
}

/** What creates a liability to a supplier. A purchase *order* is deliberately not here:
 * it is a commitment, creates no liability, and is routinely for a different amount than
 * what is eventually billed. Counting it would inflate payables with money not yet owed. */
const PAYABLE_DOC_TYPES = new Set(["supplier_bill"]);

const NOT_OWED_STATUSES = new Set(["draft", "cancelled", "voided"]);

export function isPayable(document: PayableDocument): boolean {
  return PAYABLE_DOC_TYPES.has(document.doc_type) && !NOT_OWED_STATUSES.has(document.status);
}

/** Which bill a supplier credit was raised against. One key here, unlike the sales side:
 * supplier credits are created by Finance itself, so there is no second module writing a
 * different spelling. */
export function creditedBillId(sourceRef: Record<string, unknown> | null): string | null {
  const candidate = sourceRef?.bill_id ?? sourceRef?.supplier_bill_id;
  return typeof candidate === "string" ? candidate : null;
}

export function buildOpenPayables(
  documents: PayableDocument[],
  paidByDocument: Map<string, number>,
  creditedByDocument: Map<string, number>,
  partyNames: Map<string, string>,
  asOf: Date,
): OpenPayable[] {
  const open: OpenPayable[] = [];

  for (const document of documents) {
    if (!isPayable(document)) continue;
    const total = Number(document.total_amount ?? 0);
    const credited = creditedByDocument.get(document.id) ?? 0;
    const paid = paidByDocument.get(document.id) ?? 0;
    const balance = documentBalance(total, paid, credited);
    if (balance.outstanding <= 0) continue;

    open.push({
      id: document.id,
      number: document.number,
      partyId: document.party_id,
      partyName: partyNames.get(document.party_id) ?? "Unknown supplier",
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

  // Soonest due first — this is a list of what to pay next, so the thing due tomorrow
  // belongs above the thing due in a month. A bill with no due date sorts last: there is
  // nothing to be late against.
  return open.sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31"));
}

export interface SupplierAging {
  partyId: string;
  partyName: string;
  buckets: Record<AgingBucket, number>;
  total: number;
  count: number;
}

export function agingBySupplier(items: OpenPayable[]): SupplierAging[] {
  const bySupplier = new Map<string, OpenPayable[]>();
  for (const item of items) {
    bySupplier.set(item.partyId, [...(bySupplier.get(item.partyId) ?? []), item]);
  }

  return [...bySupplier.entries()]
    .map(([partyId, supplierItems]) => {
      const buckets: Record<AgingBucket, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
      for (const item of supplierItems) buckets[item.bucket] += item.outstanding;
      return {
        partyId,
        partyName: supplierItems[0]!.partyName,
        buckets,
        total: Math.round(supplierItems.reduce((s, i) => s + i.outstanding, 0) * 100) / 100,
        count: supplierItems.length,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function summarisePayables(items: OpenPayable[]): AgingSummary {
  const buckets: Record<AgingBucket, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const item of items) buckets[item.bucket] += item.outstanding;

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const total = Object.values(buckets).reduce((s, v) => s + v, 0);
  return {
    buckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, round2(v)])) as Record<AgingBucket, number>,
    totalOutstanding: round2(total),
    overdue: round2(total - buckets.current),
    notYetDue: round2(buckets.current),
    count: items.length,
  };
}
