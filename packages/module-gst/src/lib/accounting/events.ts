import type { AccountRoleKey } from "./types";

/**
 * The financial events Finance subscribes to, as typed contracts.
 *
 * These are consumed through the platform's own event mechanism (`core.domain_events`,
 * ADR-5) -- Finance never imports another module's internals, and a module never calls
 * Finance directly. A module publishes what happened in its own language; this file is
 * Finance's reading of which of those facts have accounting consequences.
 */
export type FinanceEventType =
  | "invoice.finalized"
  | "invoice.voided"
  | "credit_note.created"
  | "debit_note.created"
  | "supplier_bill.created"
  | "supplier_bill.paid"
  | "expense.created"
  | "payment.received"
  | "payment.refunded"
  | "inventory.received"
  | "inventory.issued"
  | "inventory.returned"
  | "service.job.completed"
  | "opportunity.won";

export type SourceModule = "service" | "inventory" | "crm" | "discovery" | "finance";

/** CGST/SGST apply to supplies inside one state; IGST to inter-state ones. Both never
 * carry amounts on the same line -- the place-of-supply rules decide which pair applies,
 * and that determination already lives in this module's own tax engine. */
export interface TaxBreakdown {
  cgst?: number;
  sgst?: number;
  igst?: number;
  cess?: number;
}

export interface FinanceEvent {
  type: FinanceEventType;
  businessId: string;
  sourceModule: SourceModule;
  /** What the source module calls the thing this happened to ("invoice", "job"...). */
  sourceEntityType: string;
  sourceEntityId: string;
  /** The canonical `core.documents` row, where the event concerns one. */
  sourceDocumentId?: string | null;
  /** The `core.domain_events` row this was delivered as, kept for traceability. */
  sourceEventId?: string | null;
  occurredAt: string;
  /** Value excluding tax. */
  taxableValue?: number;
  tax?: TaxBreakdown;
  /** Gross amount, i.e. taxable value plus tax. For a payment, the amount received. */
  total?: number;
  /** Cost of the goods involved, where inventory accounting applies. */
  cost?: number;
  partyId?: string | null;
  /** Which account the value side belongs to -- lets a caller post a bill to an expense
   * account rather than inventory, or product revenue rather than service revenue,
   * without a rule per combination. */
  valueAccountRole?: AccountRoleKey;
  /** Where the money moved, for payment events. Defaults to the bank account. */
  settlementAccountRole?: Extract<AccountRoleKey, "bank" | "cash">;
}

/**
 * The idempotency key for an event, and the whole of Finance's duplicate protection:
 * processing the same source event twice must produce exactly one posting. Derived from
 * the event's own identity rather than generated, so a redelivery -- a retried webhook, a
 * replayed backlog after a licence is reactivated, a second drain of the same job row --
 * computes the same key and collides with the posting that already exists.
 *
 * `gst.journal_entries` carries a unique index on (business_id, idempotency_key), so the
 * guarantee is the database's, not a check-then-insert race in application code.
 */
export function idempotencyKeyFor(event: FinanceEvent): string {
  return `${event.sourceModule}:${event.sourceEntityType}:${event.sourceEntityId}:${event.type}`;
}

/**
 * Events that are commercially meaningful but have no accounting consequence.
 *
 * Discovery is commercial, not financial: finding a prospect, defining an ICP or even
 * winning an opportunity moves no money and must not create revenue. Revenue arrives
 * later, when an invoice is actually raised. Quotes, approved quotes and completed jobs
 * are the same story on the Service side -- work existing is not income, and posting it
 * would overstate revenue for anything quoted and never billed.
 */
export type NonPostingEventType = "opportunity.won" | "service.job.completed" | "inventory.issued";

const NON_POSTING_EVENTS = new Set<NonPostingEventType>([
  "opportunity.won",
  "service.job.completed",
  "inventory.issued",
]);

export function hasAccountingConsequence(event: FinanceEvent): boolean {
  if (event.sourceModule === "discovery") return false;
  return !NON_POSTING_EVENTS.has(event.type as NonPostingEventType);
}

export function totalTax(tax: TaxBreakdown | undefined): number {
  if (!tax) return 0;
  return (tax.cgst ?? 0) + (tax.sgst ?? 0) + (tax.igst ?? 0) + (tax.cess ?? 0);
}
