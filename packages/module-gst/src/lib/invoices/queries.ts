import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createClient } from "../../db/server";
import { creditedInvoiceId } from "../accounting/receivables";
import { deriveFinanceInvoice, type FinanceInvoice, type InvoiceDocument, type ReturnPeriodFact } from "./derive";

/** The list is for a period (fiscal year to date by default); this caps one page of it.
 * A period with more invoices than this is read by narrowing the dates, which the page
 * says when it happens. */
export const INVOICE_LIST_LIMIT = 200;

/** `.in()` filters travel in the URL; ids are sent in batches so a full page of invoices
 * never builds a request line long enough for a proxy to refuse. */
const ID_BATCH = 100;

function batches<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += ID_BATCH) out.push(items.slice(i, i + ID_BATCH));
  return out;
}

async function inBatches<R>(ids: string[], read: (batch: string[]) => PromiseLike<{ data: R[] | null; error: unknown }>): Promise<R[]> {
  const results = await Promise.all(batches(ids).map((batch) => read(batch)));
  const rows: R[] = [];
  for (const { data, error } of results) {
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

const INVOICE_COLUMNS =
  "id, doc_type, number, source_module, source_ref, party_id, doc_date, due_date, status, subtotal, discount_amount, shipping_amount, cgst_amount, sgst_amount, igst_amount, total_amount";

export interface FinanceInvoiceList {
  invoices: FinanceInvoice[];
  truncated: boolean;
}

/**
 * FIN-4: invoices for a period with their four independent statuses.
 *
 * Every read is of data another screen already owns — `core.documents` (the invoice
 * itself, and the credit notes against it), `core.payment_allocations`, `core.parties`,
 * `core.domain_events` (a failed e-invoice attempt), and Finance's own
 * `gst.journal_entries`, `gst.einvoices` and `gst.return_periods`. Nothing is copied into
 * a Finance-local invoice table: an invoice raised in Service, in Inventory or through the
 * API is the same row here. Drafts are left out — a draft is not yet an invoice anyone is
 * owed on, posted for or reports.
 *
 * RLS decides visibility throughout (tenant AND, for gst tables, licensed); the explicit
 * `business_id` filters are the usual belt-and-braces for ids that came from a URL.
 */
export const listFinanceInvoices = cache(
  async (businessId: string, from: string, to: string): Promise<FinanceInvoiceList> => {
    const core = await createCoreClient({ schema: "core" });
    const { data, error } = await core
      .from("documents")
      .select(INVOICE_COLUMNS)
      .eq("business_id", businessId)
      .eq("doc_type", "invoice")
      .neq("status", "draft")
      .gte("doc_date", from)
      .lte("doc_date", to)
      .order("doc_date", { ascending: false })
      .order("id", { ascending: true })
      .limit(INVOICE_LIST_LIMIT + 1);
    if (error) throw error;

    const all = (data ?? []) as unknown as InvoiceDocument[];
    const documents = all.slice(0, INVOICE_LIST_LIMIT);
    if (documents.length === 0) return { invoices: [], truncated: false };

    const ids = documents.map((d) => d.id);
    const gst = await createClient();

    type Allocation = { document_id: string; amount: number | string };
    type CreditNote = { total_amount: number | string; source_ref: Record<string, unknown> | null };
    type Party = { id: string; name: string };
    type Entry = { source_document_id: string; status: string; source_entity_type: string | null };
    type Einvoice = { document_id: string; status: "generated" | "cancelled"; irn: string | null };
    type FailedEvent = { payload: { invoiceId?: string; documentId?: string } | null; last_error: string | null };
    type Period = { period_start: string; period_end: string; status: string };

    const [allocations, creditNotes, parties, entries, einvoices, failedEvents, periods] = await Promise.all([
      inBatches<Allocation>(ids, (batch) =>
        core.from("payment_allocations").select("document_id, amount").eq("business_id", businessId).in("document_id", batch),
      ),
      // Credit notes carry the link to their invoice in `source_ref`, under a key that
      // differs by module (see `creditedInvoiceId`), so they are matched here rather than
      // filtered in the query.
      (async () => {
        const { data: notes, error: noteError } = await core
          .from("documents")
          .select("total_amount, source_ref")
          .eq("business_id", businessId)
          .eq("doc_type", "credit_note")
          .not("status", "in", "(draft,cancelled)");
        if (noteError) throw noteError;
        return (notes ?? []) as CreditNote[];
      })(),
      inBatches<Party>([...new Set(documents.map((d) => d.party_id).filter((p): p is string => !!p))], (batch) =>
        core.from("parties").select("id, name").eq("business_id", businessId).in("id", batch),
      ),
      inBatches<Entry>(ids, (batch) =>
        gst
          .from("journal_entries")
          .select("source_document_id, status, source_entity_type")
          .eq("business_id", businessId)
          .in("source_document_id", batch),
      ),
      inBatches<Einvoice>(ids, (batch) =>
        gst.from("einvoices").select("document_id, status, irn").eq("business_id", businessId).in("document_id", batch),
      ),
      inBatches<FailedEvent>(ids, (batch) =>
        core
          .from("domain_events")
          .select("payload, last_error")
          .eq("business_id", businessId)
          .eq("type", "document.issued")
          .eq("status", "failed")
          .in("payload->>invoiceId", batch),
      ),
      (async () => {
        const { data: rows, error: periodError } = await gst
          .from("return_periods")
          .select("period_start, period_end, status")
          .eq("business_id", businessId)
          .eq("return_type", "gstr1");
        if (periodError) throw periodError;
        return (rows ?? []) as Period[];
      })(),
    ]);

    const sumBy = <T,>(rows: T[], key: (r: T) => string | null, amount: (r: T) => number) => {
      const map = new Map<string, number>();
      for (const row of rows) {
        const k = key(row);
        if (k) map.set(k, (map.get(k) ?? 0) + amount(row));
      }
      return map;
    };
    const allocatedBy = sumBy(allocations, (a) => a.document_id, (a) => Number(a.amount ?? 0));
    const creditedBy = sumBy(creditNotes, (c) => creditedInvoiceId(c.source_ref), (c) => Number(c.total_amount ?? 0));
    const partyName = new Map(parties.map((p) => [p.id, p.name]));
    const entriesBy = new Map<string, Entry[]>();
    for (const entry of entries) entriesBy.set(entry.source_document_id, [...(entriesBy.get(entry.source_document_id) ?? []), entry]);
    const einvoiceBy = new Map(einvoices.map((e) => [e.document_id, e]));
    const failureBy = new Map<string, string>();
    for (const event of failedEvents) {
      const id = event.payload?.invoiceId ?? event.payload?.documentId;
      if (id) failureBy.set(id, event.last_error ?? "The e-invoice attempt failed.");
    }
    const gstr1Periods: ReturnPeriodFact[] = periods.map((p) => ({ periodStart: p.period_start, periodEnd: p.period_end, status: p.status }));

    const invoices = documents.map((document) =>
      deriveFinanceInvoice({
        document,
        partyName: partyName.get(document.party_id ?? "") ?? "Unknown customer",
        entries: entriesBy.get(document.id) ?? [],
        allocated: allocatedBy.get(document.id) ?? 0,
        credited: creditedBy.get(document.id) ?? 0,
        gstr1Periods,
        einvoice: einvoiceBy.get(document.id) ?? null,
        failedAttemptError: failureBy.get(document.id) ?? null,
      }),
    );
    return { invoices, truncated: all.length > INVOICE_LIST_LIMIT };
  },
);
