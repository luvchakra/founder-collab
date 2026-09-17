import { checkBalanced } from "./balance";
import type { JournalLineInput } from "./types";

/**
 * What a journal entry is made of, and what may be done to it, stated without a
 * database in sight.
 *
 * The rules here are the ones an accountant would recognise: an entry balances, a posted
 * entry is never edited, and a mistake is corrected by a reversal that leaves both
 * halves visible rather than by rewriting what was posted.
 */

export type JournalEntryStatus = "draft" | "posted" | "reversed";

export const JOURNAL_STATUS_LABEL: Record<JournalEntryStatus, string> = {
  draft: "Draft",
  posted: "Posted",
  reversed: "Reversed",
};

export interface JournalLineDraft extends JournalLineInput {
  memo?: string | null;
  partyId?: string | null;
  itemId?: string | null;
  taxCode?: string | null;
  gstAmount?: number | null;
}

/**
 * Reverses an entry: every debit becomes a credit and vice versa.
 *
 * A reversal is a new entry, not an edit. Both halves stay in the ledger and both are
 * visible in the account's history, which is the whole point — an audit asks what
 * happened, and "posted then reversed on the 14th" is an answer where a silently
 * corrected figure is not.
 */
export function reverseLines<T extends JournalLineInput>(lines: T[]): T[] {
  return lines.map((line) => ({ ...line, debit: line.credit, credit: line.debit }));
}

export interface EntryTotals {
  totalDebit: number;
  totalCredit: number;
  /** The entry's size as it would be read on a statement: debits and credits are equal
   * in a balanced entry, so either side is "the amount". */
  amount: number;
  balanced: boolean;
  difference: number;
}

export function entryTotals(lines: JournalLineInput[]): EntryTotals {
  const check = checkBalanced(lines);
  return {
    totalDebit: check.totalDebit,
    totalCredit: check.totalCredit,
    amount: Math.max(check.totalDebit, check.totalCredit),
    balanced: check.balanced,
    difference: check.difference,
  };
}

/** Whether an entry in this state may still be edited. Posting is the point of no
 * return: after it, the ledger is what it is, and a change is a new entry. */
export function isEditable(status: JournalEntryStatus): boolean {
  return status === "draft";
}

/** Whether an entry may be reversed. Only a posted one: a draft is deleted or edited
 * instead, and reversing a reversal would leave two undo entries against one posting. */
export function isReversible(status: JournalEntryStatus): boolean {
  return status === "posted";
}

export interface EntrySource {
  source_module: string | null;
  source_entity_type: string | null;
  posting_rule_key: string | null;
}

const MODULE_LABEL: Record<string, string> = {
  service: "Service",
  inventory: "Inventory",
  crm: "CRM",
  discovery: "Discovery",
  finance: "Finance",
};

/**
 * Where an entry came from, in one plain-language line — the "why does this exist?"
 * answer for anyone looking at an entry nobody remembers making.
 *
 * Automatic entries far outnumber manual ones once the operational modules are running,
 * so an entry with no source is the notable case, not the normal one.
 */
export function describeEntrySource(entry: EntrySource): string {
  if (!entry.source_module) return "Entered by hand.";
  const module = MODULE_LABEL[entry.source_module] ?? entry.source_module;
  const thing = entry.source_entity_type ? entry.source_entity_type.replace(/_/g, " ") : "activity";
  return `Posted automatically from ${article(thing)} ${thing} in ${module}.`;
}

/** "an expense", "a supplier bill" — the entity type comes from whichever module
 * published the event, so the article can't be baked into the sentence. */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

/**
 * Validates a manual entry before it is saved, returning every problem rather than the
 * first — someone fixing a journal entry should see the whole list, not one error per
 * attempt.
 *
 * Draft entries are allowed to be unbalanced (that is what a draft is for); posting is
 * where the invariant bites, which is also exactly where the database enforces it.
 */
export function validateManualEntry(
  lines: JournalLineDraft[],
  postingDate: string,
  status: JournalEntryStatus,
): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(postingDate)) {
    errors.push("Give the entry a posting date.");
  }
  if (lines.length === 0) {
    errors.push("A journal entry needs at least two lines.");
    return errors;
  }
  if (lines.some((line) => !line.accountId)) {
    errors.push("Every line needs an account.");
  }
  if (status === "posted") {
    errors.push(...checkBalanced(lines).errors);
  }
  return [...new Set(errors)];
}
