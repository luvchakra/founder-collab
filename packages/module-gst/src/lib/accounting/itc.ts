/**
 * How much input tax credit a business can actually claim.
 *
 * Three figures, from three independent places, and they mean different things:
 *
 *  - **GSTR-2B** — what the department says is available, built from suppliers' own
 *    filings. This is the ceiling. Credit not in 2B is not claimable however good the
 *    paperwork, because the supplier hasn't declared it.
 *  - **The purchase register** — what this business's own documents say it was charged.
 *  - **The ledger** — what was actually posted to the input GST account.
 *
 * The useful question is not "do these agree" but "what can be claimed, and what is at
 * risk". A ledger that claims more credit than 2B supports is an exposure: the excess
 * gets reversed with interest if it is claimed and later questioned. A 2B that offers
 * more than the books took up is money being left behind. Both matter, and they are not
 * the same problem.
 */

export interface ItcInputs {
  /** Input GST posted to the ledger for the period. */
  ledger: number;
  /** Input GST the purchase register computes from this business's own documents. */
  register: number;
  /** Input GST available per GSTR-2B. */
  twoB: number;
  /** Tax on purchases from suppliers with no GSTIN on file — structurally outside 2B,
   * since 2B is built only from registered suppliers' filings. Never counted as
   * missing: it was never eligible. */
  excludedNoGstin?: number;
  /** True when no GSTR-2B has been imported for the period. Without it there is no
   * ceiling to compare against, and claiming to know what is claimable would be a
   * fabrication. */
  twoBAvailable: boolean;
}

export type ItcRisk = "clear" | "leaving_credit" | "over_claimed" | "unknown";

export interface ItcAssessment {
  /** What can safely be claimed: the lower of what the books hold and what 2B allows. */
  claimable: number;
  /** Credit posted in the ledger beyond what 2B supports. Positive is an exposure. */
  atRisk: number;
  /** Credit 2B offers that the books never took up. Positive is money left behind. */
  unclaimed: number;
  /** Purchases structurally outside 2B — reported, never treated as missing. */
  excludedNoGstin: number;
  risk: ItcRisk;
  /** Whether the ledger and the register agree about what was charged, which is a
   * different question from whether 2B supports it. */
  booksAgree: boolean;
  headline: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function samePaise(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

export function assessItc(inputs: ItcInputs): ItcAssessment {
  const ledger = round2(inputs.ledger);
  const register = round2(inputs.register);
  const twoB = round2(inputs.twoB);
  const excludedNoGstin = round2(inputs.excludedNoGstin ?? 0);
  const booksAgree = samePaise(ledger, register);

  // Without a 2B there is no ceiling. Reporting what the books hold is honest; calling
  // it "claimable" would not be, so the risk is `unknown` rather than `clear`.
  if (!inputs.twoBAvailable) {
    return {
      claimable: ledger,
      atRisk: 0,
      unclaimed: 0,
      excludedNoGstin,
      risk: "unknown",
      booksAgree,
      headline:
        "No GSTR-2B has been imported for this period, so there is nothing to check your input credit against. Import it before you file.",
    };
  }

  const claimable = round2(Math.min(ledger, twoB));
  const atRisk = round2(Math.max(0, ledger - twoB));
  const unclaimed = round2(Math.max(0, twoB - ledger));

  // Over-claiming is reported ahead of under-claiming when both somehow apply, because
  // one costs interest and a notice while the other costs only the credit itself.
  const risk: ItcRisk = atRisk > 0 ? "over_claimed" : unclaimed > 0 ? "leaving_credit" : "clear";

  return {
    claimable,
    atRisk,
    unclaimed,
    excludedNoGstin,
    risk,
    booksAgree,
    headline: headlineFor(risk, atRisk, unclaimed),
  };
}

function headlineFor(risk: ItcRisk, atRisk: number, unclaimed: number): string {
  switch (risk) {
    case "over_claimed":
      return `Your books claim ${format(atRisk)} more input credit than GSTR-2B supports. Claiming it risks reversal with interest — check whether those suppliers have filed.`;
    case "leaving_credit":
      return `GSTR-2B offers ${format(unclaimed)} of credit your books haven't taken up. That is money available to you that you would be leaving behind.`;
    case "clear":
      return "Your input credit matches what GSTR-2B supports.";
    case "unknown":
      return "No GSTR-2B imported for this period.";
  }
}

function format(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * What to do about it, in the order worth doing it.
 *
 * Actions rather than observations: by the time someone reaches this they can already see
 * the numbers, and what they need next is the first useful move.
 */
export function itcActions(assessment: ItcAssessment): string[] {
  const actions: string[] = [];

  if (assessment.risk === "unknown") {
    return ["Import this period's GSTR-2B, then come back — everything below depends on it."];
  }

  if (assessment.atRisk > 0) {
    actions.push(
      "Check the suppliers showing as missing in 2B — most often they simply haven't filed their GSTR-1 yet, and the credit appears next period.",
    );
    actions.push(
      "Where a supplier has filed and it still isn't in 2B, the invoice details on one side are wrong. That is worth fixing before filing, not after.",
    );
  }

  if (assessment.unclaimed > 0) {
    actions.push(
      "Credit in 2B with nothing in your books usually means a bill that was never entered. Enter it and the credit becomes claimable.",
    );
  }

  // A ledger/register disagreement is a bookkeeping problem, not a 2B problem, and
  // mixing the two sends people looking in the wrong place.
  if (!assessment.booksAgree) {
    actions.push(
      "Your ledger and your purchase register disagree about what you were charged — that is a posting problem, separate from anything GSTR-2B says.",
    );
  }

  if (assessment.excludedNoGstin > 0) {
    actions.push(
      `${format(assessment.excludedNoGstin)} of purchases are from suppliers with no GSTIN on file. Those can never appear in 2B and no credit is claimable on them — worth confirming that is right.`,
    );
  }

  return actions;
}
