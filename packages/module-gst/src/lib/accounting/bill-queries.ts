import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { documentBalance, type PaymentStatus } from "./aging";
import type { BillKind } from "./bills";

export interface BillRow {
  id: string;
  number: string | null;
  partyName: string;
  docDate: string;
  dueDate: string | null;
  total: number;
  paid: number;
  outstanding: number;
  status: PaymentStatus;
  kind: BillKind;
  /** True when GST couldn't be split because a state was unknown — worth showing, since
   * no input credit is claimable on it. */
  gstSplitIncomplete: boolean;
}

/**
 * Bills and expenses as entered, newest first.
 *
 * `kind` comes from `source_ref`, not from a second doc type: a bill and an expense are
 * the same document differing only in which account took the value and whether it was
 * paid on the spot.
 */
export const listBills = cache(async (businessId: string, kind?: BillKind): Promise<BillRow[]> => {
  const core = await createCoreClient({ schema: "core" });

  const { data: documents, error } = await core
    .from("documents")
    .select("id, number, party_id, doc_date, due_date, total_amount, status, source_ref")
    .eq("business_id", businessId)
    .eq("doc_type", "supplier_bill")
    .order("doc_date", { ascending: false })
    .limit(200);
  if (error) throw error;

  type Raw = {
    id: string;
    number: string | null;
    party_id: string;
    doc_date: string;
    due_date: string | null;
    total_amount: number;
    status: string;
    source_ref: Record<string, unknown> | null;
  };

  const rows = ((documents ?? []) as Raw[]).filter((d) => {
    if (!kind) return true;
    // A document with no recorded kind predates hand entry (it came from a module), and
    // is a bill rather than an expense.
    const recorded = (d.source_ref?.kind as string | undefined) ?? "bill";
    return recorded === kind;
  });
  if (rows.length === 0) return [];

  const [{ data: allocations, error: allocError }, { data: parties, error: partyError }] =
    await Promise.all([
      core
        .from("payment_allocations")
        .select("document_id, amount")
        .eq("business_id", businessId)
        .in("document_id", rows.map((r) => r.id)),
      core
        .from("parties")
        .select("id, name")
        .eq("business_id", businessId)
        .in("id", [...new Set(rows.map((r) => r.party_id))]),
    ]);
  if (allocError) throw allocError;
  if (partyError) throw partyError;

  const paidBy = new Map<string, number>();
  for (const a of (allocations ?? []) as { document_id: string; amount: number }[]) {
    paidBy.set(a.document_id, (paidBy.get(a.document_id) ?? 0) + Number(a.amount ?? 0));
  }
  const names = new Map(((parties ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));

  return rows.map((row) => {
    const total = Number(row.total_amount ?? 0);
    const paid = paidBy.get(row.id) ?? 0;
    const balance = documentBalance(total, paid, 0);
    return {
      id: row.id,
      number: row.number,
      partyName: names.get(row.party_id) ?? "Unknown supplier",
      docDate: row.doc_date,
      dueDate: row.due_date,
      total,
      paid,
      outstanding: balance.outstanding,
      status: balance.status,
      kind: ((row.source_ref?.kind as BillKind | undefined) ?? "bill") as BillKind,
      gstSplitIncomplete: row.source_ref?.gst_split_incomplete === true,
    };
  });
});

/** Suppliers a bill can be entered against. Every party is offered, not only ones already
 * used as suppliers: `core.party_roles` gains the supplier role when one is first billed,
 * so filtering by it would make the first bill for a new supplier impossible to enter. */
export const listSuppliers = cache(async (businessId: string) => {
  const core = await createCoreClient({ schema: "core" });
  const [{ data: parties, error }, { data: taxIds, error: taxError }] = await Promise.all([
    core.from("parties").select("id, name").eq("business_id", businessId).order("name"),
    core.from("tax_identities").select("party_id, gstin").eq("business_id", businessId),
  ]);
  if (error) throw error;
  if (taxError) throw taxError;

  const withGstin = new Set(
    ((taxIds ?? []) as { party_id: string; gstin: string | null }[])
      .filter((t) => t.gstin)
      .map((t) => t.party_id),
  );

  return ((parties ?? []) as { id: string; name: string }[]).map((p) => ({
    id: p.id,
    name: p.name,
    hasGstin: withGstin.has(p.id),
  }));
});
