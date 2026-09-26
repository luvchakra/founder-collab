import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { fetchAllRows } from "@cofounderai/core/exports/fetch-all";
import type { AuditLogEntry } from "@cofounderai/core/audit/types";
import { createClient } from "../db/server";
import { documentBalance, type PaymentStatus } from "../lib/accounting/aging";
import type { BankTransactionRow } from "../lib/accounting/banking-queries";
import type { BillKind } from "../lib/accounting/bills";
import type { JournalEntryStatus } from "../lib/accounting/journal";
import {
  agingBySupplier,
  buildOpenPayables,
  creditedBillId,
  summarisePayables,
  type PayableDocument,
} from "../lib/accounting/payables";
import type { PayablesLedger } from "../lib/accounting/payables-queries";
import {
  agingByParty,
  buildOpenReceivables,
  creditedInvoiceId,
  summariseReceivables,
  type ReceivableDocument,
} from "../lib/accounting/receivables";
import type { ReceivablesLedger } from "../lib/accounting/receivables-queries";

/**
 * Export-only reads for Finance (EXP-FIN-03/04/05/06/08/17, §36-§37).
 *
 * Each function here is the export twin of a page loader that is capped -- by an explicit
 * `.limit()` (`listBills` 200, `listJournalEntries` 100, `listBankTransactions` 200,
 * `listAuditLogForBusiness` 200) or by PostgREST's silent 1,000-row ceiling on an
 * unbounded select (`getPayables`, `getReceivables`). Same table, same predicates, same
 * business filter as the loader it mirrors; the only differences are a stable order
 * ending in `id` and `fetchAllRows` paging, so "all matching records" is never cut short.
 * The accounting itself is not repeated: balances, aging and payables/receivables are
 * produced by the same pure functions the page loaders call.
 *
 * `businessId` always comes from the export context (the slug, resolved server-side);
 * every read runs on the RLS-scoped client, so `tenant AND licensed` still decides.
 */

/** Ids per `.in()` filter -- keeps each request URL well under proxy limits however many
 * documents a business has. */
const IN_CHUNK = 150;

function chunk<T>(items: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type RangeResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** Every row matching `ids`, one `.in()` chunk at a time, each chunk itself paged. */
async function selectForIds<T>(
  ids: string[],
  page: (idChunk: string[], from: number, to: number) => RangeResult<T>,
): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const rows: T[] = [];
  for (const idChunk of chunk(unique)) {
    rows.push(...(await fetchAllRows<T>((from, to) => page(idChunk, from, to))));
  }
  return rows;
}

/** Paise-rounded sum, for adding a document's own stored tax components together. */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

type Core = Awaited<ReturnType<typeof createCoreClient>>;

async function partyNames(core: Core, businessId: string, partyIds: string[]): Promise<Map<string, string>> {
  const parties = await selectForIds<{ id: string; name: string }>(partyIds, (ids, from, to) =>
    core.from("parties").select("id, name").eq("business_id", businessId).in("id", ids).order("id").range(from, to),
  );
  return new Map(parties.map((p) => [p.id, p.name]));
}

async function allocatedByDocument(core: Core, businessId: string, documentIds: string[]): Promise<Map<string, number>> {
  const allocations = await selectForIds<{ id: string; document_id: string; amount: number }>(documentIds, (ids, from, to) =>
    core
      .from("payment_allocations")
      .select("id, document_id, amount")
      .eq("business_id", businessId)
      .in("document_id", ids)
      .order("id")
      .range(from, to),
  );
  const byDocument = new Map<string, number>();
  for (const row of allocations) {
    byDocument.set(row.document_id, (byDocument.get(row.document_id) ?? 0) + Number(row.amount ?? 0));
  }
  return byDocument;
}

// ---------------------------------------------------------------------------------------
// Bills and expenses -- twin of lib/accounting/bill-queries.ts#listBills (limit 200)
// ---------------------------------------------------------------------------------------

/** Whether a document has reached the ledger: a posted (or since reversed) entry is
 * "posted", only a draft entry is "draft", nothing at all is "not_posted". */
export type PostingState = "posted" | "draft" | "not_posted";

export const POSTING_STATE_LABEL: Record<PostingState, string> = {
  posted: "Posted",
  draft: "Draft entry only",
  not_posted: "Not posted",
};

export interface BillExportRow {
  id: string;
  number: string | null;
  partyName: string;
  docDate: string;
  dueDate: string | null;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  paid: number;
  outstanding: number;
  status: PaymentStatus;
  kind: BillKind;
  gstSplitIncomplete: boolean;
  postingState: PostingState;
}

async function postingStateByDocument(businessId: string, documentIds: string[]): Promise<Map<string, PostingState>> {
  const gst = await createClient();
  const entries = await selectForIds<{ id: string; source_document_id: string; status: JournalEntryStatus }>(
    documentIds,
    (ids, from, to) =>
      gst
        .from("journal_entries")
        .select("id, source_document_id, status")
        .eq("business_id", businessId)
        .in("source_document_id", ids)
        .order("id")
        .range(from, to),
  );
  const state = new Map<string, PostingState>();
  for (const entry of entries) {
    if (entry.status === "posted" || entry.status === "reversed") state.set(entry.source_document_id, "posted");
    else if (!state.has(entry.source_document_id)) state.set(entry.source_document_id, "draft");
  }
  return state;
}

export async function listBillsForExport(businessId: string, kind: BillKind): Promise<BillExportRow[]> {
  const core = await createCoreClient({ schema: "core" });

  type Raw = {
    id: string;
    number: string | null;
    party_id: string;
    doc_date: string;
    due_date: string | null;
    subtotal: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    total_amount: number;
    source_ref: Record<string, unknown> | null;
  };

  const documents = await fetchAllRows<Raw>((from, to) =>
    core
      .from("documents")
      .select("id, number, party_id, doc_date, due_date, subtotal, cgst_amount, sgst_amount, igst_amount, total_amount, source_ref")
      .eq("business_id", businessId)
      .eq("doc_type", "supplier_bill")
      .order("doc_date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  );

  // Same rule as listBills: a document with no recorded kind predates hand entry and is
  // a bill rather than an expense.
  const rows = documents.filter((d) => ((d.source_ref?.kind as string | undefined) ?? "bill") === kind);
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [paidBy, names, posting] = await Promise.all([
    allocatedByDocument(core, businessId, ids),
    partyNames(core, businessId, rows.map((r) => r.party_id)),
    postingStateByDocument(businessId, ids),
  ]);

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
      taxableValue: Number(row.subtotal ?? 0),
      cgst: Number(row.cgst_amount ?? 0),
      sgst: Number(row.sgst_amount ?? 0),
      igst: Number(row.igst_amount ?? 0),
      total,
      paid,
      outstanding: balance.outstanding,
      status: balance.status,
      kind,
      gstSplitIncomplete: row.source_ref?.gst_split_incomplete === true,
      postingState: posting.get(row.id) ?? "not_posted",
    };
  });
}

// ---------------------------------------------------------------------------------------
// Payables / receivables -- twins of getPayables / getReceivables (unbounded selects)
// ---------------------------------------------------------------------------------------

const LEDGER_DOCUMENT_COLUMNS = "id, doc_type, number, status, party_id, doc_date, due_date, total_amount, source_ref";

export async function getPayablesForExport(businessId: string): Promise<PayablesLedger> {
  const core = await createCoreClient({ schema: "core" });
  const all = await fetchAllRows<PayableDocument>((from, to) =>
    core
      .from("documents")
      .select(LEDGER_DOCUMENT_COLUMNS)
      .eq("business_id", businessId)
      .in("doc_type", ["supplier_bill", "supplier_credit"])
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to),
  );

  const creditedByDocument = new Map<string, number>();
  for (const document of all) {
    if (document.doc_type !== "supplier_credit") continue;
    if (document.status === "draft" || document.status === "cancelled") continue;
    const billId = creditedBillId(document.source_ref);
    if (!billId) continue;
    creditedByDocument.set(billId, (creditedByDocument.get(billId) ?? 0) + Number(document.total_amount ?? 0));
  }

  const owed = all.filter((d) => d.doc_type === "supplier_bill");
  if (owed.length === 0) return { items: [], summary: summarisePayables([]), bySupplier: [] };

  const [paid, names] = await Promise.all([
    allocatedByDocument(core, businessId, owed.map((d) => d.id)),
    partyNames(core, businessId, owed.map((d) => d.party_id)),
  ]);
  const items = buildOpenPayables(owed, paid, creditedByDocument, names, new Date());
  return { items, summary: summarisePayables(items), bySupplier: agingBySupplier(items) };
}

export async function getReceivablesForExport(businessId: string): Promise<ReceivablesLedger> {
  const core = await createCoreClient({ schema: "core" });
  const all = await fetchAllRows<ReceivableDocument>((from, to) =>
    core
      .from("documents")
      .select(LEDGER_DOCUMENT_COLUMNS)
      .eq("business_id", businessId)
      .in("doc_type", ["invoice", "debit_note", "credit_note"])
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (all.length === 0) return { items: [], summary: summariseReceivables([]), byParty: [] };

  const creditedByDocument = new Map<string, number>();
  for (const document of all) {
    if (document.doc_type !== "credit_note") continue;
    if (document.status === "draft" || document.status === "cancelled") continue;
    const invoiceId = creditedInvoiceId(document.source_ref);
    if (!invoiceId) continue;
    creditedByDocument.set(invoiceId, (creditedByDocument.get(invoiceId) ?? 0) + Number(document.total_amount ?? 0));
  }

  const owed = all.filter((d) => d.doc_type !== "credit_note");
  const [allocated, names] = await Promise.all([
    allocatedByDocument(core, businessId, owed.map((d) => d.id)),
    partyNames(core, businessId, owed.map((d) => d.party_id)),
  ]);
  const items = buildOpenReceivables(owed, allocated, creditedByDocument, names, new Date());
  return { items, summary: summariseReceivables(items), byParty: agingByParty(items) };
}

// ---------------------------------------------------------------------------------------
// Journal -- twin of lib/accounting/journal-queries.ts#listJournalEntries (limit 100)
// ---------------------------------------------------------------------------------------

export interface JournalExportEntry {
  id: string;
  entry_number: string | null;
  posting_date: string;
  document_date: string | null;
  period_id: string | null;
  memo: string | null;
  status: JournalEntryStatus;
  source_module: string | null;
  source_entity_type: string | null;
  source_document_id: string | null;
  posting_rule_key: string | null;
  reversal_of_entry_id: string | null;
  posted_at: string | null;
  /** The source document's own number (an invoice or bill number), when there is one. */
  sourceDocumentNumber: string | null;
}

export interface JournalExportLine {
  id: string;
  entry_id: string;
  line_number: number;
  account_id: string;
  account_number: string;
  account_name: string;
  debit: number;
  credit: number;
  memo: string | null;
  tax_code: string | null;
}

export async function listJournalForExport(
  businessId: string,
): Promise<{ entries: JournalExportEntry[]; lines: JournalExportLine[] }> {
  const gst = await createClient();

  type RawEntry = Omit<JournalExportEntry, "sourceDocumentNumber">;
  const entries = await fetchAllRows<RawEntry>((from, to) =>
    gst
      .from("journal_entries")
      .select(
        "id, entry_number, posting_date, document_date, period_id, memo, status, source_module, source_entity_type, source_document_id, posting_rule_key, reversal_of_entry_id, posted_at",
      )
      .eq("business_id", businessId)
      .order("posting_date", { ascending: false })
      .order("entry_number", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (entries.length === 0) return { entries: [], lines: [] };

  type RawLine = Omit<JournalExportLine, "account_number" | "account_name"> & {
    accounts: { account_number: string; name: string } | null;
  };
  const [rawLines, documentNumbers] = await Promise.all([
    fetchAllRows<unknown>((from, to) =>
      gst
        .from("journal_lines")
        .select("id, entry_id, line_number, account_id, debit, credit, memo, tax_code, accounts(account_number, name)")
        .eq("business_id", businessId)
        .order("entry_id", { ascending: true })
        .order("line_number", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    (async () => {
      const core = await createCoreClient({ schema: "core" });
      const documents = await selectForIds<{ id: string; number: string | null }>(
        entries.map((e) => e.source_document_id ?? ""),
        (ids, from, to) =>
          core.from("documents").select("id, number").eq("business_id", businessId).in("id", ids).order("id").range(from, to),
      );
      return new Map(documents.map((d) => [d.id, d.number]));
    })(),
  ]);

  // PostgREST types a to-one embed as an array; at runtime it is the one row (or null).
  const lines: JournalExportLine[] = (rawLines as RawLine[]).map((line) => ({
    id: line.id,
    entry_id: line.entry_id,
    line_number: line.line_number,
    account_id: line.account_id,
    account_number: line.accounts?.account_number ?? "",
    account_name: line.accounts?.name ?? "Unknown account",
    debit: Number(line.debit ?? 0),
    credit: Number(line.credit ?? 0),
    memo: line.memo,
    tax_code: line.tax_code,
  }));

  return {
    entries: entries.map((entry) => ({
      ...entry,
      sourceDocumentNumber: entry.source_document_id ? documentNumbers.get(entry.source_document_id) ?? null : null,
    })),
    lines,
  };
}

// ---------------------------------------------------------------------------------------
// Bank statement lines -- twin of lib/accounting/banking-queries.ts#listBankTransactions
// ---------------------------------------------------------------------------------------

export interface BankTransactionExportRow extends BankTransactionRow {
  /** The journal entry a matched line was matched to, by its entry number. */
  matchedEntryNumber: string | null;
}

export async function listBankTransactionsForExport(
  businessId: string,
  bankAccountId: string,
): Promise<BankTransactionExportRow[]> {
  const gst = await createClient();
  const rows = await fetchAllRows<BankTransactionRow>((from, to) =>
    gst
      .from("bank_transactions")
      .select("id, bank_account_id, txn_date, description, reference, amount, balance_after, status, matched_entry_id")
      .eq("business_id", businessId)
      .eq("bank_account_id", bankAccountId)
      .order("txn_date", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  );

  const matched = await selectForIds<{ id: string; entry_number: string | null }>(
    rows.map((r) => r.matched_entry_id ?? ""),
    (ids, from, to) =>
      gst.from("journal_entries").select("id, entry_number").eq("business_id", businessId).in("id", ids).order("id").range(from, to),
  );
  const entryNumbers = new Map(matched.map((e) => [e.id, e.entry_number]));

  return rows.map((row) => ({
    ...row,
    amount: Number(row.amount ?? 0),
    balance_after: row.balance_after == null ? null : Number(row.balance_after),
    matchedEntryNumber: row.matched_entry_id ? entryNumbers.get(row.matched_entry_id) ?? null : null,
  }));
}

// ---------------------------------------------------------------------------------------
// Audit log -- twin of @cofounderai/core/audit/queries#listAuditLogForBusiness (limit 200)
// ---------------------------------------------------------------------------------------

export type AuditLogFilters = { entityType: string; actorId: string; dateFrom: string; dateTo: string };

export async function listAuditLogForExport(businessId: string, filters: AuditLogFilters): Promise<AuditLogEntry[]> {
  const core = await createCoreClient({ schema: "core" });
  return fetchAllRows<AuditLogEntry>((from, to) => {
    let query = core
      .from("audit_log")
      .select("id, business_id, actor_id, action, entity_type, entity_id, before, after, created_at")
      .eq("business_id", businessId);
    if (filters.entityType) query = query.eq("entity_type", filters.entityType);
    if (filters.actorId) query = query.eq("actor_id", filters.actorId);
    if (filters.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00`);
    if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59.999`);
    return query.order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to);
  });
}
