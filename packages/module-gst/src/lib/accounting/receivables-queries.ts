import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import {
  agingByParty,
  buildOpenReceivables,
  creditedInvoiceId,
  summariseReceivables,
  type OpenReceivable,
  type PartyAging,
  type ReceivableDocument,
} from "./receivables";
import type { AgingSummary } from "./aging";

export interface ReceivablesLedger {
  items: OpenReceivable[];
  summary: AgingSummary;
  byParty: PartyAging[];
}

/**
 * The receivables ledger, derived from `core.documents`, `core.payment_allocations` and
 * the credit notes raised against those documents.
 *
 * Four reads rather than one join, because the pieces live in different shapes:
 * allocations need summing per document, credit notes need resolving through a
 * `source_ref` key that differs by module (see `creditedInvoiceId`), and party names are
 * a lookup. Doing the arithmetic here keeps all of it in one tested pure function rather
 * than spread across SQL that would have to be read alongside it.
 *
 * RLS decides what is visible, so an unlicensed or non-member caller gets an empty
 * ledger rather than an error.
 */
export const getReceivables = cache(async (businessId: string): Promise<ReceivablesLedger> => {
  const core = await createCoreClient({ schema: "core" });

  const { data: documents, error } = await core
    .from("documents")
    .select("id, doc_type, number, status, party_id, doc_date, due_date, total_amount, source_ref")
    .eq("business_id", businessId)
    .in("doc_type", ["invoice", "debit_note", "credit_note"])
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw error;

  const all = (documents ?? []) as ReceivableDocument[];
  if (all.length === 0) {
    return { items: [], summary: summariseReceivables([]), byParty: [] };
  }

  // Credit notes are pulled alongside the invoices rather than in their own query: they
  // are the same table, and the link between them is a field on the credit note itself.
  const creditedByDocument = new Map<string, number>();
  for (const document of all) {
    if (document.doc_type !== "credit_note") continue;
    if (document.status === "draft" || document.status === "cancelled") continue;
    const invoiceId = creditedInvoiceId(document.source_ref);
    if (!invoiceId) continue;
    creditedByDocument.set(
      invoiceId,
      (creditedByDocument.get(invoiceId) ?? 0) + Number(document.total_amount ?? 0),
    );
  }

  const owed = all.filter((d) => d.doc_type !== "credit_note");
  const [{ data: allocations, error: allocationError }, { data: parties, error: partyError }] =
    await Promise.all([
      core
        .from("payment_allocations")
        .select("document_id, amount")
        .eq("business_id", businessId)
        .in("document_id", owed.map((d) => d.id)),
      core
        .from("parties")
        .select("id, name")
        .eq("business_id", businessId)
        .in("id", [...new Set(owed.map((d) => d.party_id))]),
    ]);
  if (allocationError) throw allocationError;
  if (partyError) throw partyError;

  const allocatedByDocument = new Map<string, number>();
  for (const row of (allocations ?? []) as { document_id: string; amount: number }[]) {
    allocatedByDocument.set(
      row.document_id,
      (allocatedByDocument.get(row.document_id) ?? 0) + Number(row.amount ?? 0),
    );
  }

  const partyNames = new Map(
    ((parties ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]),
  );

  const items = buildOpenReceivables(
    owed,
    allocatedByDocument,
    creditedByDocument,
    partyNames,
    new Date(),
  );
  return { items, summary: summariseReceivables(items), byParty: agingByParty(items) };
});
