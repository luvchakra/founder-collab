import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import {
  agingBySupplier,
  buildOpenPayables,
  creditedBillId,
  summarisePayables,
  type OpenPayable,
  type PayableDocument,
  type SupplierAging,
} from "./payables";
import type { AgingSummary } from "./aging";

export interface PayablesLedger {
  items: OpenPayable[];
  summary: AgingSummary;
  bySupplier: SupplierAging[];
}

/**
 * The payables ledger, derived from `core.documents` and `core.payment_allocations`.
 *
 * The same shape as `getReceivables`, reading the other side of the same tables — which
 * is the whole reason supplier bills went into `core.documents` rather than a Finance-
 * local table: payments, parties and allocations all work on them unchanged.
 */
export const getPayables = cache(async (businessId: string): Promise<PayablesLedger> => {
  const core = await createCoreClient({ schema: "core" });

  const { data: documents, error } = await core
    .from("documents")
    .select("id, doc_type, number, status, party_id, doc_date, due_date, total_amount, source_ref")
    .eq("business_id", businessId)
    .in("doc_type", ["supplier_bill", "supplier_credit"])
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw error;

  const all = (documents ?? []) as PayableDocument[];
  if (all.length === 0) {
    return { items: [], summary: summarisePayables([]), bySupplier: [] };
  }

  const creditedByDocument = new Map<string, number>();
  for (const document of all) {
    if (document.doc_type !== "supplier_credit") continue;
    if (document.status === "draft" || document.status === "cancelled") continue;
    const billId = creditedBillId(document.source_ref);
    if (!billId) continue;
    creditedByDocument.set(billId, (creditedByDocument.get(billId) ?? 0) + Number(document.total_amount ?? 0));
  }

  const owed = all.filter((d) => d.doc_type === "supplier_bill");
  if (owed.length === 0) {
    return { items: [], summary: summarisePayables([]), bySupplier: [] };
  }

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

  const paidByDocument = new Map<string, number>();
  for (const row of (allocations ?? []) as { document_id: string; amount: number }[]) {
    paidByDocument.set(row.document_id, (paidByDocument.get(row.document_id) ?? 0) + Number(row.amount ?? 0));
  }

  const partyNames = new Map(((parties ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const items = buildOpenPayables(owed, paidByDocument, creditedByDocument, partyNames, new Date());

  return { items, summary: summarisePayables(items), bySupplier: agingBySupplier(items) };
});
