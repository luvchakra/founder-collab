import type { AccountType, JournalLineInput, NormalBalance } from "./types";

/** Assets and costs increase on the debit side; liabilities, equity and income increase
 * on the credit side. */
export function normalBalance(type: AccountType): NormalBalance {
  return type === "asset" || type === "expense" || type === "cogs" ? "debit" : "credit";
}

/** A posted account balance, signed so that a "normal" balance reads positive whichever
 * side that is -- a bank account with money in it and a payable with money owed both
 * report as positive, which is how both appear on a statement. */
export function signedBalance(type: AccountType, totalDebit: number, totalCredit: number): number {
  return normalBalance(type) === "debit" ? totalDebit - totalCredit : totalCredit - totalDebit;
}

/** Money is compared in whole paise: 0.1 + 0.2 !== 0.3 in binary floating point, so a
 * journal that is correct to the rupee can still fail a naive `===` on its totals. The
 * ledger's own columns are numeric(18,2), so two decimal places is the real precision. */
const SCALE = 100;
function toPaise(amount: number): number {
  return Math.round(amount * SCALE);
}

export interface BalanceCheck {
  balanced: boolean;
  totalDebit: number;
  totalCredit: number;
  /** debit - credit, in the same units as the inputs. Zero when balanced. */
  difference: number;
  errors: string[];
}

/**
 * The General Ledger's central invariant: sum(debits) = sum(credits). Returns every
 * problem found rather than the first, so a user fixing a journal entry sees the whole
 * list at once instead of one error per save.
 *
 * The database enforces this too (a deferred constraint trigger on posted entries) --
 * this is the same rule stated where a form can use it, not a replacement for it.
 */
export function checkBalanced(lines: JournalLineInput[]): BalanceCheck {
  const errors: string[] = [];
  let debitPaise = 0;
  let creditPaise = 0;

  lines.forEach((line, i) => {
    const debit = toPaise(line.debit);
    const credit = toPaise(line.credit);
    if (debit < 0 || credit < 0) {
      errors.push(`Line ${i + 1}: amounts cannot be negative.`);
    }
    if (debit > 0 && credit > 0) {
      errors.push(`Line ${i + 1}: a line is either a debit or a credit, not both.`);
    }
    if (debit === 0 && credit === 0) {
      errors.push(`Line ${i + 1}: enter a debit or a credit amount.`);
    }
    debitPaise += debit;
    creditPaise += credit;
  });

  if (lines.length < 2) {
    errors.push("A journal entry needs at least two lines.");
  }

  const differencePaise = debitPaise - creditPaise;
  if (differencePaise !== 0) {
    errors.push(
      `Debits and credits must be equal (off by ${Math.abs(differencePaise) / SCALE}).`,
    );
  }

  return {
    balanced: errors.length === 0,
    totalDebit: debitPaise / SCALE,
    totalCredit: creditPaise / SCALE,
    difference: differencePaise / SCALE,
    errors,
  };
}

/** Period statuses that refuse ordinary postings -- corrections go through a reversing
 * entry in an open period rather than rewriting what was already filed. */
const CLOSED_STATUSES = new Set(["locked", "filed", "closed"]);

export function isPeriodPostable(status: string | null | undefined): boolean {
  if (!status) return true; // No period defined yet: nothing to lock against.
  return !CLOSED_STATUSES.has(status);
}
