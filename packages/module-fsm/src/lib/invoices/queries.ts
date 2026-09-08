import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { getDocumentBalance } from "@cofounderai/core/payments/queries";
import { resolvePortalToken } from "../portal-tokens/tokens";
import { listEstimateLines } from "../estimates/queries";
import type { Invoice, InvoiceListItem, PublicInvoiceView } from "./types";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

const INVOICE_SELECT = "id, number, status, doc_date, due_date, party_id, source_ref, subtotal, discount_amount, shipping_amount, cgst_amount, sgst_amount, igst_amount, total_amount, created_at, updated_at";

function toInvoice(row: Record<string, unknown>): Invoice {
  const sourceRef = (row.source_ref as { job_id?: string }) ?? {};
  return {
    id: row.id as string,
    number: row.number as string | null,
    status: row.status as Invoice["status"],
    doc_date: row.doc_date as string,
    due_date: row.due_date as string | null,
    job_id: sourceRef.job_id ?? "",
    party_id: row.party_id as string,
    subtotal: Number(row.subtotal),
    discount_amount: Number(row.discount_amount),
    shipping_amount: Number(row.shipping_amount),
    cgst_amount: Number(row.cgst_amount),
    sgst_amount: Number(row.sgst_amount),
    igst_amount: Number(row.igst_amount),
    total_amount: Number(row.total_amount),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/** A job has at most one invoice document at a time (PRD §1.4's own model -- the
 * invoice is generated once, then edited in place; a second, independent invoice for
 * the same job isn't a Kickserv concept). Same "businessId is a which-of-my-businesses
 * filter, not the authorization check" reasoning as every other query here -- RLS is
 * the real gate. */
export const getInvoiceForJob = cache(async (businessId: string, jobId: string): Promise<Invoice | null> => {
  const core = await coreClient();
  const { data, error } = await core
    .from("documents")
    .select(INVOICE_SELECT)
    .eq("business_id", businessId)
    .eq("doc_type", "invoice")
    .eq("source_module", "fsm")
    .contains("source_ref", { job_id: jobId })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? toInvoice(data) : null;
});

export const getInvoice = cache(async (businessId: string, invoiceId: string): Promise<Invoice | null> => {
  const core = await coreClient();
  const { data, error } = await core.from("documents").select(INVOICE_SELECT).eq("business_id", businessId).eq("id", invoiceId).maybeSingle();
  if (error) throw error;
  return data ? toInvoice(data) : null;
});

/** `/fsm/invoices`'s own list -- unpaid/paid tabs, sent/viewed indicators (the invoice's
 * own `status`, same "no separate timestamp column" reasoning F-4 used for estimates),
 * and each row's live balance (`core.document_balances`, D-7) rather than a cached
 * total. Same "no PostgREST embed" join-in-JS pattern as every other list query here. */
export const listInvoices = cache(async (businessId: string): Promise<InvoiceListItem[]> => {
  const core = await coreClient();
  const { data: docs, error } = await core
    .from("documents")
    .select(INVOICE_SELECT)
    .eq("business_id", businessId)
    .eq("doc_type", "invoice")
    .eq("source_module", "fsm")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (docs.length === 0) return [];

  const invoices = docs.map(toInvoice);
  const jobIds = [...new Set(invoices.map((i) => i.job_id).filter(Boolean))];
  const partyIds = [...new Set(invoices.map((i) => i.party_id))];

  const fsm = await createCoreClient({ schema: "fsm" });
  const [jobsRes, partiesRes, balances] = await Promise.all([
    jobIds.length ? fsm.from("jobs").select("id, number").in("id", jobIds) : Promise.resolve({ data: [], error: null }),
    core.from("parties").select("id, name").in("id", partyIds),
    Promise.all(invoices.map((i) => getDocumentBalance(i.id))),
  ]);
  if (jobsRes.error) throw jobsRes.error;
  if (partiesRes.error) throw partiesRes.error;

  const jobNumberById = new Map(jobsRes.data.map((j: { id: string; number: string | null }) => [j.id, j.number]));
  const partyNameById = new Map(partiesRes.data.map((p) => [p.id, p.name]));
  const balanceByDocId = new Map(balances.filter((b) => b !== null).map((b) => [b!.document_id, b!.balance_amount]));

  return invoices.map((invoice) => ({
    ...invoice,
    party_name: partyNameById.get(invoice.party_id) ?? "Unknown customer",
    job_number: invoice.job_id ? jobNumberById.get(invoice.job_id) ?? null : null,
    balance_amount: balanceByDocId.get(invoice.id) ?? invoice.total_amount,
  }));
});

/** Reuses `estimates/queries.ts#listEstimateLines` as-is -- it already resolves
 * `core.document_lines` against `core.items`/`fsm.job_charge_types` generically by
 * document id, with nothing estimate-specific in it (the "Estimate" in its name is
 * just where it was first written). Aliased here so call sites read naturally. */
export { listEstimateLines as listInvoiceLines } from "../estimates/queries";

/** The public invoice page's one read -- mirrors `getPublicEstimateView` (F-4)
 * exactly, plus the live balance since "mark paid/unpaid" (F-8) means the page can't
 * just trust `total_amount`. */
export async function getPublicInvoiceView(rawToken: string): Promise<PublicInvoiceView> {
  const token = await resolvePortalToken(rawToken, "invoice");
  const core = createCoreAdminClient({ schema: "core" });

  const [{ data: doc, error: docError }, { data: business }, { data: party }] = await Promise.all([
    core.from("documents").select(INVOICE_SELECT).eq("id", token.documentId).eq("business_id", token.businessId).single(),
    core.from("businesses").select("name, website").eq("id", token.businessId).maybeSingle(),
    core.from("parties").select("name").eq("id", token.partyId).maybeSingle(),
  ]);
  if (docError) throw docError;

  const invoice = toInvoice(doc);
  const [lines, balance] = await Promise.all([listEstimateLines(token.businessId, invoice.id), getDocumentBalance(invoice.id)]);

  return {
    businessName: business?.name ?? "Invoice",
    businessWebsite: business?.website ?? null,
    partyName: party?.name ?? "",
    invoice,
    lines,
    balanceAmount: balance?.balance_amount ?? invoice.total_amount,
  };
}
