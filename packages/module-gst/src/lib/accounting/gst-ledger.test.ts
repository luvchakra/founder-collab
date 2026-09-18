import { describe, expect, it } from "vitest";
import {
  explainGstGap,
  reconcileGst,
  summariseGstLedger,
  type GstLedgerLine,
} from "./gst-ledger";

const out = (taxCode: string, credit: number, debit = 0): GstLedgerLine => ({
  taxCode,
  credit,
  debit,
  direction: "output",
});
const inp = (taxCode: string, debit: number, credit = 0): GstLedgerLine => ({
  taxCode,
  debit,
  credit,
  direction: "input",
});

describe("summing the ledger's tax lines", () => {
  const month = [out("CGST", 90), out("SGST", 90), inp("CGST", 36), inp("SGST", 36)];

  it("splits output tax from input credit", () => {
    const { output, input } = summariseGstLedger(month);
    expect(output.total).toBe(180);
    expect(input.total).toBe(72);
  });

  it("keeps each component separate, because a return files them separately", () => {
    const { output } = summariseGstLedger(month);
    expect(output.CGST).toBe(90);
    expect(output.SGST).toBe(90);
    expect(output.IGST).toBe(0);
  });

  it("nets to what is owed to the department", () => {
    expect(summariseGstLedger(month).netPayable).toBe(108);
  });

  // More credit than output is a normal position for a business that bought more than it
  // sold that month, not an error to swallow.
  it("reports a credit carried forward as a negative net", () => {
    expect(summariseGstLedger([out("IGST", 100), inp("IGST", 250)]).netPayable).toBe(-150);
  });

  // A credit note reverses on the opposite side, which is exactly why the sign
  // convention is respected rather than absolute values being taken.
  it("lets a credit note subtract from output tax with no special case", () => {
    const withCreditNote = [...month, out("CGST", 0, 90), out("SGST", 0, 90)];
    expect(summariseGstLedger(withCreditNote).output.total).toBe(0);
  });

  it("lets a purchase return subtract from input credit", () => {
    expect(summariseGstLedger([inp("IGST", 100), inp("IGST", 0, 40)]).input.total).toBe(60);
  });

  it("ignores a line with no tax code — that is an ordinary posting, not tax", () => {
    expect(summariseGstLedger([{ taxCode: null, debit: 5000, credit: 0, direction: "output" }]).output.total).toBe(0);
  });

  it("reads a tax code whatever case it was stored in", () => {
    expect(summariseGstLedger([out("igst", 50)]).output.IGST).toBe(50);
  });

  it("ignores a tax code it doesn't recognise rather than miscounting it", () => {
    expect(summariseGstLedger([out("VAT", 50)]).output.total).toBe(0);
  });

  it("does not lose a paisa across many lines", () => {
    const lines = Array.from({ length: 3 }, () => out("CGST", 0.1));
    expect(summariseGstLedger(lines).output.CGST).toBe(0.3);
  });

  it("reports nothing as nothing", () => {
    const empty = summariseGstLedger([]);
    expect(empty.output.total).toBe(0);
    expect(empty.netPayable).toBe(0);
  });
});

describe("reconciling the books against the return", () => {
  const books = summariseGstLedger([out("CGST", 90), out("SGST", 90), inp("IGST", 72)]);

  it("agrees when both paths reach the same numbers", () => {
    const rec = reconcileGst(books, { outputTax: 180, inputTax: 72 });
    expect(rec.agrees).toBe(true);
    expect(rec.rows.every((r) => r.difference === 0)).toBe(true);
  });

  it("checks the net as well as each side, since two errors can cancel out", () => {
    const rec = reconcileGst(books, { outputTax: 200, inputTax: 92 });
    const net = rec.rows.find((r) => r.label === "Net payable")!;
    expect(net.agrees).toBe(true);
    expect(rec.agrees).toBe(false);
  });

  it("names the gap and which side is larger", () => {
    const rec = reconcileGst(books, { outputTax: 150, inputTax: 72 });
    const output = rec.rows.find((r) => r.label.startsWith("Output"))!;
    expect(output.perBooks).toBe(180);
    expect(output.perReturn).toBe(150);
    expect(output.difference).toBe(30);
  });

  // Output is out by 30, input by 12 and the net by 18 — the largest is the one to lead
  // with, not the sum of them.
  it("reports the largest single gap, not their total", () => {
    expect(reconcileGst(books, { outputTax: 150, inputTax: 60 }).largestGap).toBe(30);
  });

  // The two sides are summed from different tables in a different order; floating point
  // will not give the same total twice for the same money.
  it("does not call a floating-point crumb a disagreement", () => {
    const fiddly = summariseGstLedger([out("CGST", 0.1), out("CGST", 0.2)]);
    expect(reconcileGst(fiddly, { outputTax: 0.3, inputTax: 0 }).agrees).toBe(true);
  });
});

describe("explaining a gap", () => {
  const books = summariseGstLedger([out("CGST", 100)]);

  it("says nothing when there is nothing to explain", () => {
    expect(explainGstGap(reconcileGst(books, { outputTax: 100, inputTax: 0 }))).toEqual([]);
  });

  // The direction of the gap genuinely narrows the cause, so it must not be generic.
  it("points at an unposted invoice when the return holds more than the books", () => {
    const causes = explainGstGap(reconcileGst(books, { outputTax: 150, inputTax: 0 }));
    expect(causes.join(" ")).toMatch(/never reached the ledger|haven't posted/i);
  });

  it("points the other way when the books hold more than the return", () => {
    const causes = explainGstGap(reconcileGst(books, { outputTax: 50, inputTax: 0 }));
    expect(causes.join(" ")).toMatch(/return isn't picking up/i);
  });

  it("always raises the timing cause, which produces this shape on both sides", () => {
    const causes = explainGstGap(reconcileGst(books, { outputTax: 50, inputTax: 0 }));
    expect(causes.join(" ")).toMatch(/dated in one period but posted in another/i);
  });

  // It cannot know which side is wrong, and asserting a cause it cannot prove sends
  // people to fix the wrong thing.
  it("offers causes to check rather than a verdict", () => {
    for (const cause of explainGstGap(reconcileGst(books, { outputTax: 50, inputTax: 10 }))) {
      expect(cause).not.toMatch(/\bis wrong\b|\bmust be\b/i);
    }
  });
});
