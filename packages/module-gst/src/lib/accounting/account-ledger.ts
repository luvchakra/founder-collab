import { normalBalance, signedBalance } from "./balance";
import type { JournalEntryStatus } from "./journal";
import type { AccountType } from "./types";

/**
 * FIN-7 — report drill-down: one account's transactions for a period, the rows behind a
 * figure on a statement.
 *
 * Pure: the lines and totals come in fetched, so the arithmetic — brought forward, running
 * balance, carried forward — can be tested without a database. The one rule that matters
 * is that the drill-down totals to exactly the figure that was clicked, which is why the
 * period totals come from the same aggregate the statements read rather than from summing
 * the (possibly capped) list of lines here.
 */

export interface AccountLedgerAccount {
  id: string;
  accountNumber: string;
  name: string;
  type: AccountType;
}

export interface RawLedgerLine {
  entryId: string;
  entryNumber: string | null;
  postingDate: string;
  entryMemo: string | null;
  status: JournalEntryStatus;
  sourceModule: string | null;
  sourceEntityType: string | null;
  sourceDocumentId: string | null;
  lineMemo: string | null;
  debit: number;
  credit: number;
}

export interface AccountLedgerLine extends RawLedgerLine {
  /** The account's balance after this line, in the direction the account normally reads
   * (a bank balance and a payable are both positive). */
  runningBalance: number;
}

export interface AccountLedger {
  account: AccountLedgerAccount;
  /** Where the account stood before the period — opening balance plus everything posted
   * earlier. Always zero for income and cost accounts: a profit and loss figure is the
   * period's activity, not a position. */
  broughtForward: number;
  lines: AccountLedgerLine[];
  periodDebit: number;
  periodCredit: number;
  /** The period's net movement in the account's normal direction. */
  movement: number;
  /** What the statement shows for this account: the movement for an income or cost
   * account, the position at the period's end for anything on the balance sheet. */
  statementAmount: number;
  /** More lines exist in the period than were listed. The totals above are still the
   * whole period's; only the list is capped. */
  truncated: boolean;
}

/** Accounts a profit and loss is made of — reported as activity, not position. */
export function isProfitAndLossType(type: AccountType): boolean {
  return type === "income" || type === "cogs" || type === "expense";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildAccountLedger(input: {
  account: AccountLedgerAccount;
  openingBalance: number;
  /** Debits/credits posted before the period starts. */
  priorDebit: number;
  priorCredit: number;
  /** The whole period's totals, from the ledger aggregate. */
  periodDebit: number;
  periodCredit: number;
  lines: RawLedgerLine[];
  /** The list was capped: more of the period's entries exist than were fetched. */
  truncated: boolean;
}): AccountLedger {
  const { account } = input;
  const broughtForward = isProfitAndLossType(account.type)
    ? 0
    : round2(input.openingBalance + signedBalance(account.type, input.priorDebit, input.priorCredit));

  const direction = normalBalance(account.type) === "debit" ? 1 : -1;
  let running = broughtForward;
  const lines = [...input.lines]
    .sort((a, b) => a.postingDate.localeCompare(b.postingDate) || (a.entryNumber ?? "").localeCompare(b.entryNumber ?? ""))
    .map((line) => {
      running = round2(running + direction * (line.debit - line.credit));
      return { ...line, runningBalance: running };
    });

  const movement = round2(signedBalance(account.type, input.periodDebit, input.periodCredit));
  return {
    account,
    broughtForward,
    lines,
    periodDebit: round2(input.periodDebit),
    periodCredit: round2(input.periodCredit),
    movement,
    statementAmount: round2(broughtForward + movement),
    truncated: input.truncated,
  };
}
