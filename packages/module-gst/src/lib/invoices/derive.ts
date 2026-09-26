import { documentBalance, type PaymentStatus } from "../accounting/aging";
import { financeEventFromDocument, type PostableDocument } from "../accounting/document-events";

/**
 * FIN-4 — the Finance invoice view (§18).
 *
 * An invoice here is a `core.documents` row, read as-is — never a second invoice master.
 * What Finance adds is four statuses that are deliberately kept apart, because each is a
 * different question with a different owner and they move independently:
 *
 *  - accounting: is it in the ledger? (`gst.journal_entries` by `source_document_id`)
 *  - payment:    has the customer paid? (`core.payment_allocations` + credit notes)
 *  - GST:        has it been reported? (the GSTR-1 return period covering its date)
 *  - e-invoice:  has an IRN been generated? (`gst.einvoices`, plus a failed attempt)
 *
 * An invoice can be paid but unposted, posted but unreported, filed but never e-invoiced —
 * collapsing them into one "status" would hide exactly the combinations someone needs to
 * find. Pure, so each rule can be tested without a database.
 */

export type AccountingStatus = "posted" | "reversed" | "not_posted" | "not_applicable";
export type InvoicePaymentStatus = PaymentStatus | "not_applicable";
export type InvoiceGstStatus = "no_gst" | "not_in_return" | "in_return" | "filed" | "not_applicable";
export type InvoiceEinvoiceStatus = "generated" | "cancelled" | "failed" | "not_generated";

export const ACCOUNTING_STATUS_LABEL: Record<AccountingStatus, string> = {
  posted: "Posted",
  reversed: "Reversed",
  not_posted: "Not posted",
  not_applicable: "No entry",
};

export const PAYMENT_STATUS_LABEL: Record<InvoicePaymentStatus, string> = {
  unpaid: "Unpaid",
  partially_paid: "Part paid",
  paid: "Paid",
  overpaid: "Overpaid",
  not_applicable: "—",
};

export const GST_STATUS_LABEL: Record<InvoiceGstStatus, string> = {
  no_gst: "No GST",
  not_in_return: "Not in a return",
  in_return: "In a return",
  filed: "Filed",
  not_applicable: "—",
};

export const EINVOICE_STATUS_LABEL: Record<InvoiceEinvoiceStatus, string> = {
  generated: "IRN generated",
  cancelled: "IRN cancelled",
  failed: "Attempt failed",
  not_generated: "Not generated",
};

/** The `StatusBadge` key each status reads as — its colour, via the platform's one
 * status-tone mapping, rather than a Finance-local palette. */
export const STATUS_TONE_KEY = {
  accounting: { posted: "success", reversed: "void", not_posted: "pending", not_applicable: "none" },
  payment: { unpaid: "unpaid", partially_paid: "partially_paid", paid: "paid", overpaid: "warning", not_applicable: "none" },
  gst: { no_gst: "none", not_in_return: "pending", in_return: "in_progress", filed: "filed", not_applicable: "none" },
  einvoice: { generated: "success", cancelled: "cancelled", failed: "failed", not_generated: "none" },
} as const;

/** Statuses that mean the invoice never became a financial fact. */
const NOT_ISSUED = new Set(["draft", "cancelled"]);

export interface InvoiceDocument extends PostableDocument {
  number: string | null;
  due_date: string | null;
}

export interface InvoiceEntryFact {
  status: string;
  source_entity_type: string | null;
}

export interface ReturnPeriodFact {
  periodStart: string;
  periodEnd: string;
  status: string;
}

export interface FinanceInvoice {
  id: string;
  number: string | null;
  partyName: string;
  docDate: string;
  dueDate: string | null;
  sourceModule: string;
  documentStatus: string;
  total: number;
  tax: number;
  accounting: AccountingStatus;
  payment: { status: InvoicePaymentStatus; paid: number; credited: number; outstanding: number };
  gst: { status: InvoiceGstStatus; returnStatus: string | null };
  einvoice: { status: InvoiceEinvoiceStatus; irn: string | null; error: string | null };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Accounting status from the entries that carry this document's id.
 *
 * Payment entries carry the document id too, but they are the payment's accounting, not
 * the invoice's — an unposted invoice with a posted receipt is still an unposted invoice.
 * A document with no accounting consequence (cancelled, or a zero-value invoice) gets
 * "No entry" rather than a "Not posted" that would send someone looking for a problem.
 */
export function accountingStatus(document: InvoiceDocument, entries: InvoiceEntryFact[]): AccountingStatus {
  const own = entries.filter((e) => e.source_entity_type !== "payment_allocation");
  if (own.some((e) => e.status === "posted")) return "posted";
  if (own.length > 0 && own.every((e) => e.status === "reversed")) return "reversed";
  return financeEventFromDocument(document) ? "not_posted" : "not_applicable";
}

/** GST status: which GSTR-1 period (if any) the invoice's date falls in, and whether that
 * return has been filed. An invoice carrying no GST has nothing to report. */
export function gstStatus(
  document: InvoiceDocument,
  gstr1Periods: ReturnPeriodFact[],
): { status: InvoiceGstStatus; returnStatus: string | null } {
  if (NOT_ISSUED.has(document.status)) return { status: "not_applicable", returnStatus: null };
  const tax = Number(document.cgst_amount ?? 0) + Number(document.sgst_amount ?? 0) + Number(document.igst_amount ?? 0);
  if (round2(tax) === 0) return { status: "no_gst", returnStatus: null };
  const period = gstr1Periods.find((p) => p.periodStart <= document.doc_date && document.doc_date <= p.periodEnd);
  if (!period) return { status: "not_in_return", returnStatus: null };
  return { status: period.status === "filed" ? "filed" : "in_return", returnStatus: period.status };
}

/** E-invoice status: the generation record wins; with none, a failed `document.issued`
 * attempt is reported as a failure (its error kept for the tooltip) rather than as
 * "not generated", which would read as nobody having tried. */
export function einvoiceStatus(
  einvoice: { status: "generated" | "cancelled"; irn: string | null } | null,
  failedAttemptError: string | null,
): { status: InvoiceEinvoiceStatus; irn: string | null; error: string | null } {
  if (einvoice) return { status: einvoice.status, irn: einvoice.irn, error: null };
  if (failedAttemptError !== null) return { status: "failed", irn: null, error: failedAttemptError };
  return { status: "not_generated", irn: null, error: null };
}

export function deriveFinanceInvoice(input: {
  document: InvoiceDocument;
  partyName: string;
  entries: InvoiceEntryFact[];
  allocated: number;
  credited: number;
  gstr1Periods: ReturnPeriodFact[];
  einvoice: { status: "generated" | "cancelled"; irn: string | null } | null;
  failedAttemptError: string | null;
}): FinanceInvoice {
  const { document } = input;
  const total = round2(Number(document.total_amount ?? 0));
  const tax = round2(Number(document.cgst_amount ?? 0) + Number(document.sgst_amount ?? 0) + Number(document.igst_amount ?? 0));

  // A cancelled or voided invoice is not owed, whatever was paid against it — the same
  // rule receivables applies — so its payment status is not a thing to chase.
  const owed = !NOT_ISSUED.has(document.status) && document.status !== "voided";
  const balance = documentBalance(total, input.allocated, input.credited);

  return {
    id: document.id,
    number: document.number,
    partyName: input.partyName,
    docDate: document.doc_date,
    dueDate: document.due_date,
    sourceModule: document.source_module,
    documentStatus: document.status,
    total,
    tax,
    accounting: accountingStatus(document, input.entries),
    payment: {
      status: owed ? balance.status : "not_applicable",
      paid: round2(input.allocated),
      credited: round2(input.credited),
      outstanding: owed ? balance.outstanding : 0,
    },
    gst: gstStatus(document, input.gstr1Periods),
    einvoice: einvoiceStatus(input.einvoice, input.failedAttemptError),
  };
}

export interface InvoiceStatusCounts {
  notPosted: number;
  unpaid: number;
  notReported: number;
  einvoiceFailed: number;
}

/** The four "needs attention" counts across a list, one per status dimension. */
export function countNeedingAttention(invoices: FinanceInvoice[]): InvoiceStatusCounts {
  return {
    notPosted: invoices.filter((i) => i.accounting === "not_posted").length,
    unpaid: invoices.filter((i) => i.payment.status === "unpaid" || i.payment.status === "partially_paid").length,
    notReported: invoices.filter((i) => i.gst.status === "not_in_return").length,
    einvoiceFailed: invoices.filter((i) => i.einvoice.status === "failed").length,
  };
}

/** Filters the list by one status dimension, from the URL: `accounting:not_posted`,
 * `payment:unpaid`, `gst:not_in_return`, `einvoice:failed`. Unknown filters show all. */
export function filterInvoices(invoices: FinanceInvoice[], filter: string | undefined): FinanceInvoice[] {
  switch (filter) {
    case "accounting:not_posted":
      return invoices.filter((i) => i.accounting === "not_posted");
    case "payment:unpaid":
      return invoices.filter((i) => i.payment.status === "unpaid" || i.payment.status === "partially_paid");
    case "gst:not_in_return":
      return invoices.filter((i) => i.gst.status === "not_in_return");
    case "einvoice:failed":
      return invoices.filter((i) => i.einvoice.status === "failed");
    default:
      return invoices;
  }
}
