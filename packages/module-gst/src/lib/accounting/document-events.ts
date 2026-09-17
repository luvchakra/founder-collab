import type { FinanceEvent, FinanceEventType, SourceModule } from "./events";
import type { AccountRoleKey } from "./types";

/**
 * Reading a `core.documents` row as a financial event.
 *
 * Finance never imports another module's internals (ADR-10): an invoice raised by
 * Service and one raised by Inventory are both just rows in `core.documents`, which is
 * cross-module shared data Finance may read directly (ADR-5, mechanism 1). This file is
 * the translation between that canonical row and the event vocabulary the posting rules
 * speak.
 */
export interface PostableDocument {
  id: string;
  doc_type: string;
  source_module: string;
  party_id: string | null;
  doc_date: string;
  status: string;
  subtotal: number;
  discount_amount: number;
  shipping_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
}

/** Document types that have an accounting consequence, and the event each one is.
 * Anything else (an estimate, a sales order, a purchase order) is a commitment, not a
 * transaction: no money has moved and no revenue has been earned. */
const EVENT_BY_DOC_TYPE: Record<string, FinanceEventType> = {
  invoice: "invoice.finalized",
  credit_note: "credit_note.created",
  debit_note: "debit_note.created",
  sales_return: "credit_note.created",
};

const SOURCE_MODULES = new Set<SourceModule>(["service", "inventory", "crm", "discovery", "finance"]);

/** `core.documents.source_module` carries whichever module wrote the row; the event
 * vocabulary uses "service" where the package is named "fsm". */
function sourceModuleOf(document: PostableDocument): SourceModule {
  const raw = document.source_module === "fsm" ? "service" : document.source_module;
  // A module this file doesn't know is still a real document; treating it as Finance's
  // own keeps it postable rather than dropping it.
  return SOURCE_MODULES.has(raw as SourceModule) ? (raw as SourceModule) : "finance";
}

/**
 * Which revenue account the value side belongs to.
 *
 * Inventory sells goods, Service sells work — posting both to one undifferentiated
 * "sales" account would make gross margin unreadable, which is the number a founder
 * actually looks at. A business that wants them merged re-points both roles at the same
 * account in its own mappings; the default keeps them apart.
 */
function revenueRoleOf(document: PostableDocument): AccountRoleKey {
  return sourceModuleOf(document) === "inventory" ? "product_revenue" : "service_revenue";
}

/**
 * The taxable value: what the customer is charged before tax.
 *
 * Shipping is part of the consideration for the supply under GST and is charged at the
 * supply's own rate, so it belongs in the taxable value rather than sitting outside it.
 * A discount reduces it. `core.documents`' own trigger computes the tax on exactly this
 * basis, so deriving it any other way here would put the entry out of balance against
 * the document it came from.
 */
export function taxableValueOf(document: PostableDocument): number {
  const value =
    Number(document.subtotal ?? 0) -
    Number(document.discount_amount ?? 0) +
    Number(document.shipping_amount ?? 0);
  return Math.round(value * 100) / 100;
}

/**
 * Builds the event for a document, or returns null when the document has no accounting
 * consequence — a draft, or a type that is a commitment rather than a transaction.
 *
 * Returning null rather than throwing matters: most documents in a business are not
 * postable, and that is a normal fact about them, not an error.
 */
export function financeEventFromDocument(
  document: PostableDocument,
  options: { sourceEventId?: string | null; occurredAt?: string } = {},
): FinanceEvent | null {
  const type = EVENT_BY_DOC_TYPE[document.doc_type];
  if (!type) return null;
  // A draft is not yet a financial fact; it is issued (or its module's equivalent) that
  // makes it one.
  if (document.status === "draft" || document.status === "cancelled") return null;

  const total = Math.round(Number(document.total_amount ?? 0) * 100) / 100;
  if (total === 0 && taxableValueOf(document) === 0) return null;

  return {
    type,
    businessId: "",
    sourceModule: sourceModuleOf(document),
    sourceEntityType: document.doc_type,
    sourceEntityId: document.id,
    sourceDocumentId: document.id,
    sourceEventId: options.sourceEventId ?? null,
    occurredAt: options.occurredAt ?? `${document.doc_date}T00:00:00Z`,
    taxableValue: taxableValueOf(document),
    tax: {
      cgst: Number(document.cgst_amount ?? 0),
      sgst: Number(document.sgst_amount ?? 0),
      igst: Number(document.igst_amount ?? 0),
    },
    total,
    partyId: document.party_id,
    valueAccountRole: revenueRoleOf(document),
  };
}
