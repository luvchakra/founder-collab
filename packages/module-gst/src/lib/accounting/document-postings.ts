import { financeEventFromDocument, type PostableDocument } from "./document-events";
import { describeEntrySource } from "./journal";
import type { JournalEntryDetail } from "./journal-queries";
import type { AccountType } from "./types";

/**
 * FIN-12 — explainable accounting, in reverse.
 *
 * Every automatic entry already says which rule produced it and from what (the entry page's
 * "Why this entry exists"). This is the other direction: start from a source document and
 * answer "what did this do to the books?" — each entry it caused, in order, why each one
 * exists, and the net effect on every account once they are all added up.
 *
 * Pure: the entries come in already fetched, so the explanation can be tested without a
 * database.
 */

/** Plain names for every `core.documents.doc_type`, for headings and links. */
export const SOURCE_DOC_TYPE_LABEL: Record<string, string> = {
  estimate: "Estimate",
  sales_order: "Sales order",
  invoice: "Invoice",
  credit_note: "Credit note",
  debit_note: "Debit note",
  proforma_invoice: "Proforma invoice",
  purchase_order: "Purchase order",
  sales_return: "Sales return",
  supplier_bill: "Bill",
  supplier_credit: "Supplier credit",
};

export function documentLabel(docType: string, number: string | null): string {
  const kind = SOURCE_DOC_TYPE_LABEL[docType] ?? docType.replace(/_/g, " ");
  return number ? `${kind} ${number}` : kind;
}

export type PostingKind = "document" | "cost_of_sale" | "payment" | "reversal";

export const POSTING_KIND_LABEL: Record<PostingKind, string> = {
  document: "Document posting",
  cost_of_sale: "Cost of sale",
  payment: "Payment",
  reversal: "Reversal",
};

export interface ExplainedEntry {
  entry: JournalEntryDetail;
  kind: PostingKind;
  /** One sentence: which rule, from what. */
  why: string;
}

export interface NetEffectRow {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: AccountType;
  /** Net of every entry the document caused, on whichever side it lands. */
  debit: number;
  credit: number;
}

/** Whether the document is in the ledger. `reversed` means every posting of the
 * document itself has since been offset — the entries stay, the effect is gone. */
export type DocumentLedgerStatus = "not_posted" | "posted" | "reversed";

export interface DocumentPostingSummary {
  entries: ExplainedEntry[];
  netEffect: NetEffectRow[];
  status: DocumentLedgerStatus;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function postingKindOf(entry: Pick<JournalEntryDetail, "reversal_of_entry_id" | "source_entity_type" | "posting_rule_key">): PostingKind {
  if (entry.reversal_of_entry_id) return "reversal";
  if (entry.source_entity_type === "payment_allocation") return "payment";
  if (entry.posting_rule_key === "sale.cogs") return "cost_of_sale";
  return "document";
}

function whyOf(entry: JournalEntryDetail, kind: PostingKind): string {
  if (kind === "reversal") return "Reverses an earlier entry for this document: every line swapped, both halves kept.";
  const rule = entry.posting_rule_key
    ? ` Rule ${entry.posting_rule_key}${entry.posting_rule_version ? ` v${entry.posting_rule_version}` : ""}.`
    : "";
  return `${describeEntrySource(entry)}${rule}`;
}

/**
 * The entries a document caused, each explained, plus their combined effect.
 *
 * Posted and reversed entries both count towards the net effect, for the reason
 * `gst.account_balances` documents: a reversed entry still happened, and its reversal is
 * what offsets it — so a fully reversed invoice nets to nothing, which is the truth.
 * Drafts never reach here (automatic entries are posted), but are skipped anyway.
 */
export function explainDocumentPostings(entries: JournalEntryDetail[]): DocumentPostingSummary {
  const explained = entries.map((entry) => {
    const kind = postingKindOf(entry);
    return { entry, kind, why: whyOf(entry, kind) };
  });

  const byAccount = new Map<string, NetEffectRow & { net: number }>();
  for (const { entry } of explained) {
    if (entry.status === "draft") continue;
    for (const line of entry.lines) {
      const row = byAccount.get(line.account_id) ?? {
        accountId: line.account_id,
        accountNumber: line.account_number,
        accountName: line.account_name,
        accountType: line.account_type,
        debit: 0,
        credit: 0,
        net: 0,
      };
      row.net = round2(row.net + line.debit - line.credit);
      byAccount.set(line.account_id, row);
    }
  }

  const netEffect = [...byAccount.values()]
    .filter((row) => row.net !== 0)
    .map(({ net, ...row }) => ({ ...row, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 }))
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

  const own = explained.filter((e) => e.kind === "document" || e.kind === "cost_of_sale");
  const status: DocumentLedgerStatus =
    own.length === 0 ? "not_posted" : own.every((e) => e.entry.status === "reversed") ? "reversed" : "posted";

  return { entries: explained, netEffect, status };
}

/**
 * Why a document has no entries, in words — the answer the reverse view owes when the
 * list is empty, rather than an empty table that reads like a bug.
 *
 * Decided by `financeEventFromDocument`, the same function the posting path uses, so this
 * can never disagree with what the ledger would actually do with the document.
 */
export function unpostedReason(document: PostableDocument): string {
  if (document.status === "draft") {
    return "This is still a draft. A draft isn't a financial fact yet — it posts once it's issued.";
  }
  if (document.status === "cancelled") {
    return "This document was cancelled before it was issued, so it never had an accounting consequence.";
  }
  const event = financeEventFromDocument(document);
  if (!event) {
    const kind = (SOURCE_DOC_TYPE_LABEL[document.doc_type] ?? "document").toLowerCase();
    return `A ${kind} is a commitment rather than a transaction: no money has moved and nothing has been earned, so it never posts.`;
  }
  return "This document should be in the ledger but isn't yet. It usually means the chart of accounts wasn't set up when it was issued — run the backfill, or check the exceptions queue for the reason.";
}
