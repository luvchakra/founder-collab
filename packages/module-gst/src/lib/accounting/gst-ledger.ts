/**
 * The GST ledger: what the books say about tax, and whether it agrees with the return.
 *
 * Two independent paths arrive at the same number. The **return** is computed from
 * `core.documents` — the sales and purchase registers, which is what actually gets filed.
 * The **ledger** is computed from `gst.journal_lines`, where every posting carried its own
 * CGST/SGST/IGST split. They are built from different tables by different code, and that
 * is the point: when they agree, the filed return is backed by the books; when they
 * don't, something is being counted in one place and not the other.
 *
 * Reconciling them is not bookkeeping pedantry. A return that overstates output tax costs
 * real money; one that understates it is a notice later. Either way the founder needs to
 * know *before* filing, not after.
 */

export type GstComponent = "CGST" | "SGST" | "IGST" | "CESS";

export const GST_COMPONENTS: readonly GstComponent[] = ["CGST", "SGST", "IGST", "CESS"];

export type GstDirection = "output" | "input";

/** One journal line's tax content, flattened to what reconciliation needs. */
export interface GstLedgerLine {
  taxCode: string | null;
  /** Signed as the ledger holds it: a credit to GST payable is output tax collected, a
   * debit to input GST is credit receivable. */
  debit: number;
  credit: number;
  /** Which of the two GST accounts this line hit. */
  direction: GstDirection;
}

export type GstTotals = Record<GstComponent, number> & { total: number };

function emptyTotals(): GstTotals {
  return { CGST: 0, SGST: 0, IGST: 0, CESS: 0, total: 0 };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normaliseCode(code: string | null): GstComponent | null {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  return (GST_COMPONENTS as readonly string[]).includes(upper) ? (upper as GstComponent) : null;
}

/**
 * Sums a period's tax lines into output and input totals, per component.
 *
 * Output tax is credit-positive and input tax debit-positive, because that is the side
 * each sits on: tax collected is a liability until it is paid over, tax paid is
 * receivable until it is offset. A credit note reverses on the opposite side and so
 * subtracts naturally, with no special case — which is exactly why the sign convention is
 * worth respecting rather than taking absolute values.
 */
export function summariseGstLedger(lines: GstLedgerLine[]): {
  output: GstTotals;
  input: GstTotals;
  /** Positive means owed to the department, negative means credit carried forward. */
  netPayable: number;
} {
  const output = emptyTotals();
  const input = emptyTotals();

  for (const line of lines) {
    const code = normaliseCode(line.taxCode);
    if (!code) continue;
    const debit = Number(line.debit ?? 0);
    const credit = Number(line.credit ?? 0);

    if (line.direction === "output") {
      output[code] = round2(output[code] + credit - debit);
    } else {
      input[code] = round2(input[code] + debit - credit);
    }
  }

  output.total = round2(GST_COMPONENTS.reduce((sum, c) => sum + output[c], 0));
  input.total = round2(GST_COMPONENTS.reduce((sum, c) => sum + input[c], 0));

  return { output, input, netPayable: round2(output.total - input.total) };
}

export interface GstReconciliationRow {
  label: string;
  /** What the books say, from `gst.journal_lines`. */
  perBooks: number;
  /** What the return says, from the sales/purchase registers over `core.documents`. */
  perReturn: number;
  difference: number;
  agrees: boolean;
}

export interface GstReconciliation {
  rows: GstReconciliationRow[];
  agrees: boolean;
  /** The largest single gap, so the caller can lead with the one worth explaining. */
  largestGap: number;
}

/**
 * Compares the two paths, component by component.
 *
 * Compared in whole paise: the two sides are summed from different tables in a different
 * order, and floating point will not give the same total twice for the same money. A
 * reconciliation that reports a 0.0000001 difference as a disagreement is a
 * reconciliation nobody will read twice.
 */
export function reconcileGst(
  books: { output: GstTotals; input: GstTotals },
  ret: { outputTax: number; inputTax: number },
): GstReconciliation {
  const rows: GstReconciliationRow[] = [
    row("Output tax (on sales)", books.output.total, ret.outputTax),
    row("Input tax credit (on purchases)", books.input.total, ret.inputTax),
    row(
      "Net payable",
      round2(books.output.total - books.input.total),
      round2(ret.outputTax - ret.inputTax),
    ),
  ];

  return {
    rows,
    agrees: rows.every((r) => r.agrees),
    largestGap: Math.max(...rows.map((r) => Math.abs(r.difference))),
  };
}

function row(label: string, perBooks: number, perReturn: number): GstReconciliationRow {
  const difference = round2(perBooks - perReturn);
  return {
    label,
    perBooks: round2(perBooks),
    perReturn: round2(perReturn),
    difference,
    agrees: Math.round(difference * 100) === 0,
  };
}

/**
 * Why the two sides might differ, in the order worth checking.
 *
 * Offered as questions rather than conclusions: this cannot know which side is wrong, and
 * a reconciliation that asserts a cause it cannot prove sends people to fix the wrong
 * thing. What it can do is name the handful of causes that produce exactly this shape of
 * gap, so the search starts somewhere sensible.
 */
export function explainGstGap(reconciliation: GstReconciliation): string[] {
  if (reconciliation.agrees) return [];

  const output = reconciliation.rows.find((r) => r.label.startsWith("Output"));
  const input = reconciliation.rows.find((r) => r.label.startsWith("Input"));
  const causes: string[] = [];

  if (output && !output.agrees) {
    causes.push(
      output.difference > 0
        ? "The books hold more output tax than the return does — an invoice the return isn't picking up, or one posted into this period but dated outside it."
        : "The return holds more output tax than the books do — an invoice that was issued but never reached the ledger. Check the dashboard for documents that haven't posted.",
    );
  }

  if (input && !input.agrees) {
    causes.push(
      input.difference > 0
        ? "The books claim more input credit than the return does — a purchase posted but not in the purchase register for this period."
        : "The return claims more input credit than the books do — a bill in the register that was never posted to the ledger.",
    );
  }

  causes.push("A document dated in one period but posted in another will show on both sides of this, in opposite directions.");
  return causes;
}
