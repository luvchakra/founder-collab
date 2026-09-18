/**
 * The pre-flight check before filing a return.
 *
 * Everything Finance knows about a period, asked as one question: *is this safe to file?*
 * The checks are deliberately drawn from different places — the ledger, the registers,
 * GSTR-2B, the bank, the period lock — because a return can be arithmetically perfect and
 * still wrong for reasons none of those would catch alone.
 *
 * Three outcomes, and the distinction between the last two is the whole point:
 *
 *  - **blocked** — filing this would be wrong. Something is missing or contradictory and
 *    no judgement call makes it fine.
 *  - **warn** — filing may well be correct, but a person should look first. Most real
 *    returns have at least one of these and file anyway.
 *  - **pass** — nothing to say.
 *
 * A check that can't be evaluated is never silently a pass. "We couldn't tell" and "we
 * checked and it's fine" look identical on a screen and mean opposite things, so an
 * unevaluated check says so.
 */

export type CheckStatus = "pass" | "warn" | "block" | "unknown";

export interface ReadinessCheck {
  key: string;
  label: string;
  status: CheckStatus;
  /** What was found, in one line. */
  detail: string;
  /** What to do about it. Omitted when there is nothing to do. */
  action?: string;
}

export interface ReadinessInputs {
  hasAccounts: boolean;
  /** Documents issued in the period that never reached the ledger. */
  unpostedCount: number;
  /** Whether the ledger's GST agrees with the return's, and by how much. */
  ledgerAgreesWithReturn: boolean;
  ledgerReturnGap: number;
  /** Input credit beyond what GSTR-2B supports. */
  itcAtRisk: number;
  twoBImported: boolean;
  /** B2B sales with a missing or invalid customer GSTIN. */
  invalidGstinCount: number;
  /** Bank lines in the period still unmatched to the ledger. */
  unmatchedBankLines: number;
  /** Null when no period covers these dates. */
  periodStatus: string | null;
}

export interface FilingReadiness {
  checks: ReadinessCheck[];
  blockers: ReadinessCheck[];
  warnings: ReadinessCheck[];
  /** True only when nothing blocks. Warnings do not stop a filing — a person decides. */
  canFile: boolean;
  headline: string;
}

function money(amount: number): string {
  return `₹${Math.abs(amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function assessFilingReadiness(inputs: ReadinessInputs): FilingReadiness {
  const checks: ReadinessCheck[] = [];

  // Nothing else means anything without a ledger to check against, so this is first and
  // it blocks: every check below would otherwise pass vacuously on an empty ledger.
  checks.push(
    inputs.hasAccounts
      ? { key: "accounts", label: "Books are set up", status: "pass", detail: "Chart of accounts in place." }
      : {
          key: "accounts",
          label: "Books are set up",
          status: "block",
          detail: "No chart of accounts, so nothing has been posted and there is nothing to check this return against.",
          action: "Set up your chart of accounts.",
        },
  );

  checks.push(
    inputs.unpostedCount === 0
      ? { key: "posted", label: "Everything is posted", status: "pass", detail: "Every document issued this period reached the ledger." }
      : {
          key: "posted",
          label: "Everything is posted",
          status: "block",
          detail: `${inputs.unpostedCount} document${inputs.unpostedCount === 1 ? "" : "s"} issued this period never reached the ledger.`,
          action: "Resolve them before filing — a return that leaves them out understates your tax.",
        },
  );

  // With no ledger, "the ledger agrees with the return" is not true, it is meaningless:
  // an empty ledger and an empty return would agree vacuously and this would report a
  // pass on a business that has posted nothing at all. Same for the credit check below.
  checks.push(
    !inputs.hasAccounts
      ? {
          key: "reconciled",
          label: "Ledger agrees with the return",
          status: "unknown",
          detail: "There is no ledger to compare the return against.",
          action: "Set up your chart of accounts.",
        }
      : inputs.ledgerAgreesWithReturn
      ? { key: "reconciled", label: "Ledger agrees with the return", status: "pass", detail: "Both paths reach the same tax." }
      : {
          key: "reconciled",
          label: "Ledger agrees with the return",
          status: "block",
          detail: `The ledger and the return differ by ${money(inputs.ledgerReturnGap)}.`,
          action: "One of the two is counting something the other isn't. Resolve it before filing.",
        },
  );

  // Not a blocker: claiming credit 2B doesn't yet support is a real risk, but it is a
  // judgement the founder is entitled to make — suppliers file late all the time.
  if (!inputs.hasAccounts) {
    checks.push({
      key: "itc",
      label: "Input credit is supported",
      status: "unknown",
      detail: "Nothing has been posted, so there is no claimed credit to check.",
      action: "Set up your chart of accounts.",
    });
  } else if (!inputs.twoBImported) {
    checks.push({
      key: "itc",
      label: "Input credit is supported",
      status: "unknown",
      detail: "No GSTR-2B imported for this period, so the credit claimed can't be checked.",
      action: "Import the GSTR-2B.",
    });
  } else if (inputs.itcAtRisk > 0) {
    checks.push({
      key: "itc",
      label: "Input credit is supported",
      status: "warn",
      detail: `${money(inputs.itcAtRisk)} of credit is beyond what GSTR-2B supports.`,
      action: "Usually a supplier who hasn't filed yet. Claiming it risks reversal with interest.",
    });
  } else {
    checks.push({ key: "itc", label: "Input credit is supported", status: "pass", detail: "Every rupee claimed is in GSTR-2B." });
  }

  // A wrong GSTIN doesn't block *your* filing — it costs your customer their credit,
  // which they will come back about.
  checks.push(
    inputs.invalidGstinCount === 0
      ? { key: "gstin", label: "Customer GSTINs are valid", status: "pass", detail: "Every B2B sale has a valid GSTIN." }
      : {
          key: "gstin",
          label: "Customer GSTINs are valid",
          status: "warn",
          detail: `${inputs.invalidGstinCount} B2B sale${inputs.invalidGstinCount === 1 ? " has" : "s have"} a missing or invalid GSTIN.`,
          action: "Those customers won't get their input credit, and will ask you to amend.",
        },
  );

  checks.push(
    inputs.unmatchedBankLines === 0
      ? { key: "bank", label: "Bank is reconciled", status: "pass", detail: "No unmatched bank lines in this period." }
      : {
          key: "bank",
          label: "Bank is reconciled",
          status: "warn",
          detail: `${inputs.unmatchedBankLines} bank line${inputs.unmatchedBankLines === 1 ? "" : "s"} in this period ${inputs.unmatchedBankLines === 1 ? "is" : "are"} still unmatched.`,
          action: "An unmatched receipt can mean a sale that was never invoiced.",
        },
  );

  checks.push(periodCheck(inputs.periodStatus));

  const blockers = checks.filter((c) => c.status === "block");
  const warnings = checks.filter((c) => c.status === "warn" || c.status === "unknown");

  return {
    checks,
    blockers,
    warnings,
    canFile: blockers.length === 0,
    headline: headlineFor(blockers.length, warnings.length),
  };
}

/**
 * The period's own state.
 *
 * An open period is a warning, not a blocker: people file from an open period constantly,
 * and locking is what you do *after* you're satisfied. An already-filed period is the
 * notable one — filing it again is a different, deliberate act.
 */
function periodCheck(status: string | null): ReadinessCheck {
  if (!status) {
    return {
      key: "period",
      label: "Period is closed off",
      status: "warn",
      detail: "No accounting period covers these dates, so nothing stops new entries landing in them later.",
      action: "Open the fiscal year to be able to lock this month once you've filed.",
    };
  }
  if (status === "filed" || status === "closed") {
    return {
      key: "period",
      label: "Period is closed off",
      status: "warn",
      detail: `This period is already marked ${status}.`,
      action: "Filing it again is a revised return, not a first one — make sure that's what you mean.",
    };
  }
  if (status === "locked") {
    return { key: "period", label: "Period is closed off", status: "pass", detail: "Locked — no new entries can land in it." };
  }
  return {
    key: "period",
    label: "Period is closed off",
    status: "warn",
    detail: `This period is still ${status}, so entries can still be posted into it after you file.`,
    action: "Lock it once you've filed, so the filed figures stay the filed figures.",
  };
}

function headlineFor(blockers: number, warnings: number): string {
  if (blockers > 0) {
    return `${blockers} thing${blockers === 1 ? "" : "s"} to resolve before this can be filed.`;
  }
  if (warnings > 0) {
    return `Nothing blocks filing, but ${warnings} thing${warnings === 1 ? " is" : "s are"} worth a look first.`;
  }
  return "Everything checks out. This return is ready to file.";
}
