import type { BankLine } from "./bank-matching";
import type { JournalLineDraft } from "./journal";

/**
 * FIN-8 — bank rules: saved categorisation for statement lines.
 *
 * Matching (`bank-matching.ts`) answers "which existing entry is this line?". A rule
 * answers the other common case — there is no entry, because the line *is* the
 * transaction (rent, a subscription, bank charges) — by remembering where that kind of
 * line goes, instead of someone re-deciding it every month.
 *
 * Pure: which rule fits a line, and the entry applying it would post, are decided here so
 * they can be tested without a database. Rules suggest; a person applies (the same rule as
 * matching — nothing is posted silently).
 */

export type RuleDirection = "in" | "out" | "any";

export const RULE_DIRECTION_LABEL: Record<RuleDirection, string> = {
  in: "Money in",
  out: "Money out",
  any: "Either way",
};

export interface BankRule {
  id: string;
  name: string;
  matchText: string;
  direction: RuleDirection;
  minAmount: number | null;
  maxAmount: number | null;
  accountId: string;
  partyId: string | null;
  priority: number;
  isActive: boolean;
}

/** Whether a rule fits a line: its text appears in the description (case and spacing
 * ignored), the money moved the rule's way, and the amount is within its bounds. */
export function ruleMatches(rule: BankRule, line: Pick<BankLine, "description" | "amount">): boolean {
  if (!rule.isActive) return false;
  const haystack = line.description.toLowerCase().replace(/\s+/g, " ");
  const needle = rule.matchText.trim().toLowerCase().replace(/\s+/g, " ");
  if (!needle || !haystack.includes(needle)) return false;
  if (rule.direction === "in" && line.amount <= 0) return false;
  if (rule.direction === "out" && line.amount >= 0) return false;
  const size = Math.abs(line.amount);
  if (rule.minAmount !== null && size < rule.minAmount) return false;
  if (rule.maxAmount !== null && size > rule.maxAmount) return false;
  return true;
}

/** The rule that applies to a line: the first match by priority (lowest first), ties
 * broken by name, so which rule wins is never an accident of insertion order. */
export function findMatchingRule<R extends BankRule>(rules: R[], line: Pick<BankLine, "description" | "amount">): R | null {
  return (
    [...rules]
      .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
      .find((rule) => ruleMatches(rule, line)) ?? null
  );
}

/**
 * The two lines applying a rule posts. Money in debits the bank's ledger account and
 * credits the rule's account; money out the reverse. The rule's party rides on the
 * counter line, which is what makes the party dimension (FIN-9) report bank-categorised
 * spending by supplier.
 */
export function categorisationLines(rule: BankRule, bankLedgerAccountId: string, amount: number, memo: string): JournalLineDraft[] {
  const size = Math.round(Math.abs(amount) * 100) / 100;
  const bank: JournalLineDraft = { accountId: bankLedgerAccountId, debit: amount > 0 ? size : 0, credit: amount > 0 ? 0 : size, memo };
  const counter: JournalLineDraft = {
    accountId: rule.accountId,
    debit: amount > 0 ? 0 : size,
    credit: amount > 0 ? size : 0,
    memo,
    partyId: rule.partyId,
  };
  return [bank, counter];
}

export interface BankRuleInput {
  name: string;
  matchText: string;
  direction: string;
  minAmount: number | null;
  maxAmount: number | null;
  accountId: string;
  priority: number;
}

/** Every problem with a rule, not just the first — the form shows them together. */
export function bankRuleProblems(input: BankRuleInput): string[] {
  const problems: string[] = [];
  if (!input.name.trim()) problems.push("Give the rule a name.");
  if (input.matchText.trim().length < 2) problems.push("The text to look for needs at least two characters.");
  if (!["in", "out", "any"].includes(input.direction)) problems.push("Choose whether the rule is for money in, money out or either.");
  if (!input.accountId) problems.push("Choose the account these lines belong to.");
  for (const [label, value] of [["minimum", input.minAmount], ["maximum", input.maxAmount]] as const) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) problems.push(`The ${label} amount must be zero or more.`);
  }
  if (input.minAmount !== null && input.maxAmount !== null && input.maxAmount < input.minAmount) {
    problems.push("The maximum amount can't be below the minimum.");
  }
  if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 10000) {
    problems.push("Priority is a whole number from 0 to 10000.");
  }
  return problems;
}
