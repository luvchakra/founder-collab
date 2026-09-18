import { registerEventHandler } from "@cofounderai/core/events/registry";
import type { DomainEvent } from "@cofounderai/core/events/types";
import { generateEinvoice } from "../lib/einvoicing/mutations";
import { postIssuedDocument, postPaymentAllocation } from "../lib/accounting/event-posting";

/**
 * module-gst's own event subscription (00-MASTER-PLAN.md's module contract layout;
 * S-2, the story's own literal spec line: "a stub consumer of `document.issued`").
 * Imported once, for its side effect, from
 * apps/web/app/api/cron/drain-events/route.ts before the drain loop runs -- same
 * reasoning module-fsm's/module-inventory's own handlers.ts already document.
 *
 * `document.issued` (00-MASTER-PLAN.md §6's event catalogue: "fsm, inventory ->
 * gst (e-invoice)") is published with `requiredModule: 'gst'` by both
 * `module-fsm/lib/invoices/mutations.ts#issueInvoice` and
 * `module-inventory/lib/sales-invoices/mutations.ts#generateSalesInvoice` -- so
 * `drainDomainEvents()` parks it (never calls this handler at all) for any business
 * that hasn't licensed `gst`, and `core.replay_parked_events()` (wired into
 * `activateLicense()`, C-4) un-parks it the moment they do, with zero code here
 * needing to know that happened. This is the ADR-10 degraded-mode row from
 * 00-MASTER-PLAN.md §6's own table: "FSM invoice -> e-invoice/IRN | GST module
 * generates IRN + e-way bill | plain invoice PDF, GST fields still computed and
 * stored" -- an unlicensed business's invoice is unaffected (GST fields already live
 * on `core.documents` regardless of which module wrote them), a licensed one gets an
 * automatic e-invoice attempt.
 *
 * Only the e-invoice half auto-generates here -- see
 * `lib/eway-bill/mutations.ts#generateEwayBill`'s own docstring for why an e-way bill
 * is never auto-triggered from `document.issued` alone (it needs shipment/transport
 * details this platform doesn't model at invoice-issue time).
 *
 * Silently no-ops (not a failure) when the business hasn't configured e-Invoicing
 * credentials at all -- the common case for a demo platform -- rather than treating
 * "nothing to generate against" as an error worth retrying. Any other failure
 * (a genuine GSP-unreachable error, since no live GSP sandbox exists in this session)
 * propagates so `drainDomainEvents()`'s own retry-with-backoff applies, same as every
 * other handler in this codebase.
 */
registerEventHandler("document.issued", async (event: DomainEvent) => {
  const payload = event.payload as { invoiceId?: string; docType?: string };
  if (payload.docType !== "invoice" || !payload.invoiceId) return;

  try {
    await generateEinvoice(event.business_id, payload.invoiceId);
  } catch (err) {
    if (err instanceof Error && err.message === "No e-Invoicing credentials configured for this business.") return;
    throw err;
  }
});

/**
 * Finance's own subscription to the same event — the automatic half of the ledger.
 *
 * A second handler on `document.issued` rather than an extension of the e-invoicing one
 * above: the two are independent (a business can have Finance's books without a GSP
 * account, and vice versa), and `drainDomainEvents()` deliberately runs every registered
 * handler for a type even when an earlier one throws, so an unreachable GSP never costs
 * the business its accounting entry.
 *
 * Idempotent by construction: `postFinanceEvent` derives the entry's idempotency key from
 * the document's own identity, and `gst.journal_entries` carries a unique index on it —
 * so the drain's own retry-with-backoff, a replay of parked events after a licence is
 * reactivated, and a second drain of the same row all converge on the one entry that
 * already exists.
 *
 * Refusals (a document with no accounting consequence, a chart of accounts that isn't
 * set up yet) come back as values and are left alone. Throwing would make the drain retry
 * with backoff until it gives up permanently, and neither of those is fixed by retrying.
 */
registerEventHandler("document.issued", async (event: DomainEvent) => {
  // `documentId` is what Finance's own publishers send; `invoiceId` is the spelling
  // Service and Inventory have always used, kept because their events are in flight and
  // renaming a payload key would drop every one already queued.
  const payload = event.payload as { documentId?: string; invoiceId?: string };
  const documentId = payload.documentId ?? payload.invoiceId;
  if (!documentId) return;
  await postIssuedDocument(event.business_id, documentId, event.id);
});

/**
 * Settlements reaching the ledger.
 *
 * Without this, an invoice posts its receivable and the receipt never clears it: the
 * Finance dashboard's "Owed to you" (read from the ledger) and the Receivables screen
 * (read from `core.payment_allocations`) would quietly disagree the moment anyone paid,
 * and the disagreement grows with every payment. Two screens in one module reporting
 * different numbers for the same thing is worse than either screen not existing.
 *
 * Idempotent per allocation, not per payment: a payment split across three invoices is
 * three settlements, each keyed on its own allocation, so a redelivery of one is caught
 * by the unique index without touching the others.
 */
registerEventHandler("payment.allocated", async (event: DomainEvent) => {
  const payload = event.payload as { allocationId?: string };
  if (!payload.allocationId) return;
  await postPaymentAllocation(event.business_id, payload.allocationId, event.id);
});
