import { computeLineGst, type GstBreakup } from "@cofounderai/core/lib/gst";

/**
 * Entering a supplier bill or a direct expense by hand.
 *
 * Both are the same document — `core.documents` with `doc_type = 'supplier_bill'` — and
 * differ only in which account the value lands on and whether money moved at the same
 * time. An expense is a bill for something that was never stock: rent, software, travel.
 * Giving them separate tables would be the triplication `00-MASTER-PLAN.md` §5 exists to
 * prevent, and would mean every payables query had to read two places and hope they
 * agreed.
 *
 * Entered header-only rather than line by line. `core.document_lines` requires an
 * `item_id`, and a rent bill has no item — but more to the point, a supplier's line detail
 * is on the supplier's own paper, and re-keying it to reach a total the bill already
 * states is work that buys nothing.
 */

export type BillKind = "bill" | "expense";

export interface BillInput {
  kind: BillKind;
  partyId: string;
  billNumber?: string | null;
  billDate: string;
  dueDate?: string | null;
  /** Value before tax. */
  taxableValue: number;
  gstRatePercent: number;
  /** Which account the value lands on — inventory for stock, an expense account
   * otherwise. Resolved to a real account id at the database boundary. */
  valueAccountId: string;
  notes?: string | null;
  /** Expenses only: settled at the moment they are recorded. */
  paidImmediately?: boolean;
  paymentMethod?: string | null;
}

export interface BillTotals extends GstBreakup {
  taxableValue: number;
  total: number;
}

/**
 * The bill's totals, with GST split by place of supply.
 *
 * Seller and buyer are the reverse of a sale: the supplier is the seller, this business is
 * the buyer. Getting that backwards would flip CGST/SGST against IGST on every purchase,
 * which is the mistake that makes input credit unclaimable.
 *
 * `incomplete` comes straight through from `computeLineGst` rather than being smoothed
 * over — when either state is unknown it returns zeroes and says so, and the form shows
 * that instead of a confident wrong split.
 */
export function billTotals(input: {
  taxableValue: number;
  gstRatePercent: number;
  supplierStateCode: string | null;
  businessStateCode: string | null;
}): BillTotals {
  const taxableValue = Math.round(input.taxableValue * 100) / 100;
  const gst = computeLineGst({
    taxableValue,
    gstRatePercent: input.gstRatePercent,
    sellerStateCode: input.supplierStateCode,
    buyerStateCode: input.businessStateCode,
  });

  return {
    ...gst,
    taxableValue,
    total: Math.round((taxableValue + gst.totalTax) * 100) / 100,
  };
}

/**
 * Everything wrong with a bill, not just the first thing.
 *
 * A due date before the bill date is worth refusing rather than accepting: it is almost
 * always a typo, and it would put the bill straight into the oldest aging bucket and stay
 * there, looking like a supplier nobody has paid for months.
 */
export function billProblems(input: Partial<BillInput>): string[] {
  const problems: string[] = [];

  if (!input.partyId) problems.push("Choose the supplier.");
  if (!input.valueAccountId) problems.push("Choose which account this should go to.");
  if (!input.billDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.billDate)) {
    problems.push("Give the bill a date.");
  }
  if (input.dueDate && input.billDate && input.dueDate < input.billDate) {
    problems.push("The due date can't be before the bill date.");
  }

  const value = Number(input.taxableValue);
  if (!Number.isFinite(value)) {
    problems.push("The amount has to be a number.");
  } else if (value <= 0) {
    problems.push("A bill needs an amount greater than zero.");
  }

  const rate = Number(input.gstRatePercent ?? 0);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    problems.push("The GST rate has to be between 0 and 100.");
  }

  return problems;
}

/** The GST rates that actually exist in India, so a form offers a list rather than a free
 * number anyone can fat-finger. 0 is included: exempt and zero-rated purchases are real. */
export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28] as const;

/** What a bill starts as. An expense paid on the spot is settled the moment it is
 * recorded; a bill on terms is not. */
export function initialStatus(input: Pick<BillInput, "kind" | "paidImmediately">): string {
  return input.kind === "expense" && input.paidImmediately ? "paid" : "posted";
}
