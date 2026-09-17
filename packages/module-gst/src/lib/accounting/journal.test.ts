import { describe, expect, it } from "vitest";
import {
  describeEntrySource,
  entryTotals,
  isEditable,
  isReversible,
  reverseLines,
  validateManualEntry,
  type JournalEntryStatus,
} from "./journal";

const ALL_STATUSES: JournalEntryStatus[] = ["draft", "posted", "reversed"];

const sale = [
  { accountId: "ar", debit: 1180, credit: 0 },
  { accountId: "revenue", debit: 0, credit: 1000 },
  { accountId: "gst", debit: 0, credit: 180 },
];

describe("reversing an entry", () => {
  it("swaps every line's side", () => {
    expect(reverseLines(sale)).toEqual([
      { accountId: "ar", debit: 0, credit: 1180 },
      { accountId: "revenue", debit: 1000, credit: 0 },
      { accountId: "gst", debit: 180, credit: 0 },
    ]);
  });

  it("produces an entry that still balances", () => {
    expect(entryTotals(reverseLines(sale)).balanced).toBe(true);
  });

  // The reversal nets the original to nothing without either one being edited away --
  // both halves stay visible in the account's history.
  it("nets the original to nothing", () => {
    const combined = [...sale, ...reverseLines(sale)];
    const totals = entryTotals(combined);
    expect(totals.totalDebit).toBe(totals.totalCredit);
    for (const accountId of ["ar", "revenue", "gst"]) {
      const net = combined
        .filter((l) => l.accountId === accountId)
        .reduce((sum, l) => sum + l.debit - l.credit, 0);
      expect(net, accountId).toBe(0);
    }
  });

  it("keeps every other field on the line", () => {
    const [line] = reverseLines([{ accountId: "ar", debit: 100, credit: 0, memo: "Invoice 7" }]);
    expect(line).toMatchObject({ accountId: "ar", memo: "Invoice 7" });
  });

  it("round-trips back to the original", () => {
    expect(reverseLines(reverseLines(sale))).toEqual(sale);
  });
});

describe("an entry's totals", () => {
  it("reports the entry's size as one amount, not two", () => {
    expect(entryTotals(sale).amount).toBe(1180);
  });

  it("reports an unbalanced entry as unbalanced, with the gap", () => {
    const totals = entryTotals([
      { accountId: "a", debit: 100, credit: 0 },
      { accountId: "b", debit: 0, credit: 90 },
    ]);
    expect(totals.balanced).toBe(false);
    expect(totals.difference).toBe(10);
  });

  // 0.1 + 0.2 !== 0.3 in binary floating point: an entry correct to the paisa must not
  // read as out of balance.
  it("does not lose a paisa to floating point", () => {
    expect(
      entryTotals([
        { accountId: "a", debit: 0.1, credit: 0 },
        { accountId: "b", debit: 0.2, credit: 0 },
        { accountId: "c", debit: 0, credit: 0.3 },
      ]).balanced,
    ).toBe(true);
  });
});

describe("what may be done to an entry", () => {
  // Posting is the point of no return: after it the ledger is what it is.
  it("only allows editing a draft", () => {
    expect(ALL_STATUSES.filter(isEditable)).toEqual(["draft"]);
  });

  // Reversing a reversal would leave two undo entries against one posting.
  it("only allows reversing a posted entry", () => {
    expect(ALL_STATUSES.filter(isReversible)).toEqual(["posted"]);
  });
});

describe("explaining where an entry came from", () => {
  it("says plainly when someone typed it", () => {
    expect(describeEntrySource({ source_module: null, source_entity_type: null, posting_rule_key: null }))
      .toMatch(/by hand/i);
  });

  it("names the module and the thing that caused it", () => {
    expect(
      describeEntrySource({
        source_module: "inventory",
        source_entity_type: "supplier_bill",
        posting_rule_key: "supplier_bill.created",
      }),
    ).toBe("Posted automatically from a supplier bill in Inventory.");
  });

  it("gets the article right for an entity type that starts with a vowel", () => {
    expect(
      describeEntrySource({ source_module: "finance", source_entity_type: "expense", posting_rule_key: null }),
    ).toBe("Posted automatically from an expense in Finance.");
  });

  it("falls back to the raw module name for one it doesn't know", () => {
    expect(
      describeEntrySource({ source_module: "payroll", source_entity_type: null, posting_rule_key: null }),
    ).toContain("payroll");
  });
});

describe("validating a manual entry", () => {
  const today = "2026-09-17";

  it("accepts a balanced entry", () => {
    expect(validateManualEntry(sale, today, "posted")).toEqual([]);
  });

  // A draft is explicitly a work in progress; demanding balance before it can be saved
  // would mean never being able to save a half-built entry.
  it("lets a draft be unbalanced but still wants accounts and a date", () => {
    expect(validateManualEntry([{ accountId: "a", debit: 100, credit: 0 }], today, "draft")).toEqual([]);
    expect(validateManualEntry([{ accountId: "", debit: 100, credit: 0 }], today, "draft")).toContain(
      "Every line needs an account.",
    );
  });

  it("refuses to post an unbalanced entry", () => {
    const errors = validateManualEntry(
      [
        { accountId: "a", debit: 100, credit: 0 },
        { accountId: "b", debit: 0, credit: 90 },
      ],
      today,
      "posted",
    );
    expect(errors.join(" ")).toMatch(/equal/i);
  });

  it("wants a real posting date", () => {
    expect(validateManualEntry(sale, "", "posted")).toContain("Give the entry a posting date.");
    expect(validateManualEntry(sale, "17/09/2026", "posted")).toContain("Give the entry a posting date.");
  });

  it("reports every problem at once rather than one per attempt", () => {
    const errors = validateManualEntry([{ accountId: "", debit: 0, credit: 0 }], "", "posted");
    expect(errors.length).toBeGreaterThan(2);
  });

  it("never repeats the same problem twice", () => {
    const errors = validateManualEntry(
      [
        { accountId: "", debit: 0, credit: 0 },
        { accountId: "", debit: 0, credit: 0 },
      ],
      "",
      "posted",
    );
    expect(new Set(errors).size).toBe(errors.length);
  });

  it("says an empty entry needs lines, without piling on", () => {
    expect(validateManualEntry([], "2026-09-17", "posted")).toEqual([
      "A journal entry needs at least two lines.",
    ]);
  });
});
