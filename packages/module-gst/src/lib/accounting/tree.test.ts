import { describe, expect, it } from "vitest";
import { orderAccountTree, sumByType, type AccountRow } from "./tree";
import { DEFAULT_ACCOUNT_ROLES, DEFAULT_CHART_OF_ACCOUNTS } from "./chart-of-accounts";
import { normalBalance } from "./balance";

function account(over: Partial<AccountRow> & { id: string }): AccountRow {
  return {
    account_number: over.id,
    name: over.id,
    type: "asset",
    subtype: null,
    parent_account_id: null,
    is_active: true,
    is_system: false,
    opening_balance: 0,
    ...over,
  };
}

const noBalances = new Map<string, number>();

describe("ordering the account tree", () => {
  const rows = [
    account({ id: "1000" }),
    account({ id: "1100", parent_account_id: "1000" }),
    account({ id: "1110", parent_account_id: "1100" }),
    account({ id: "2000", type: "liability" }),
    account({ id: "2100", type: "liability", parent_account_id: "2000" }),
  ];

  it("puts each parent immediately before its own children", () => {
    expect(orderAccountTree(rows, noBalances).map((a) => a.id)).toEqual([
      "1000",
      "1100",
      "1110",
      "2000",
      "2100",
    ]);
  });

  it("records depth so the UI can indent instead of nesting tables", () => {
    const depths = Object.fromEntries(orderAccountTree(rows, noBalances).map((a) => [a.id, a.depth]));
    expect(depths).toEqual({ "1000": 0, "1100": 1, "1110": 2, "2000": 0, "2100": 1 });
  });

  it("returns every account exactly once", () => {
    const out = orderAccountTree(rows, noBalances);
    expect(out).toHaveLength(rows.length);
    expect(new Set(out.map((a) => a.id)).size).toBe(rows.length);
  });

  // An account whose parent the caller cannot see must still be listed: dropping it
  // would hide an account that holds a balance.
  it("keeps an account whose parent is missing, at the top level", () => {
    const orphan = account({ id: "9000", parent_account_id: "does-not-exist", opening_balance: 25 });
    const out = orderAccountTree([...rows, orphan], noBalances);
    const found = out.find((a) => a.id === "9000");
    expect(found?.depth).toBe(0);
    expect(found?.balance).toBe(25);
  });

  // The database forbids self-parenting, but a longer loop would otherwise never
  // terminate -- a wrong tree is recoverable, a hung request is not.
  it("terminates on a parent cycle and still lists both accounts", () => {
    const a = account({ id: "a", parent_account_id: "b" });
    const b = account({ id: "b", parent_account_id: "a" });
    const out = orderAccountTree([a, b], noBalances);
    expect(out.map((x) => x.id).sort()).toEqual(["a", "b"]);
  });
});

describe("balances", () => {
  it("uses the posted balance from the ledger view when there is one", () => {
    const out = orderAccountTree([account({ id: "1100", opening_balance: 500 })], new Map([["1100", 1750]]));
    expect(out[0]!.balance).toBe(1750);
  });

  // The view already folds the opening balance in, so an account absent from it has no
  // posted lines at all -- its balance is exactly what it opened with.
  it("falls back to the opening balance for an account with no posted lines", () => {
    const out = orderAccountTree([account({ id: "1100", opening_balance: 500 })], noBalances);
    expect(out[0]!.balance).toBe(500);
  });
});

describe("section totals", () => {
  const rows = [
    account({ id: "1000" }),
    account({ id: "1100", parent_account_id: "1000" }),
    account({ id: "1200", parent_account_id: "1000" }),
    account({ id: "4000", type: "income" }),
    account({ id: "4100", type: "income", parent_account_id: "4000" }),
  ];
  const balances = new Map([
    ["1000", 3000],
    ["1100", 1000],
    ["1200", 2000],
    ["4000", 900],
    ["4100", 900],
  ]);

  it("counts leaves only, so a section is not reported at double its size", () => {
    const totals = Object.fromEntries(sumByType(orderAccountTree(rows, balances)).map((t) => [t.type, t.total]));
    expect(totals.asset).toBe(3000);
    expect(totals.income).toBe(900);
  });

  it("omits a section with no accounts rather than reporting a zero", () => {
    expect(sumByType(orderAccountTree(rows, balances)).map((t) => t.type).sort()).toEqual(["asset", "income"]);
  });

  it("rounds to paise so floating point never leaks into a reported total", () => {
    const cents = [account({ id: "a", opening_balance: 0.1 }), account({ id: "b", opening_balance: 0.2 })];
    expect(sumByType(orderAccountTree(cents, noBalances))[0]!.total).toBe(0.3);
  });
});

describe("the default chart of accounts", () => {
  const numbers = new Set(DEFAULT_CHART_OF_ACCOUNTS.map((a) => a.accountNumber));

  it("gives every account a unique number", () => {
    expect(numbers.size).toBe(DEFAULT_CHART_OF_ACCOUNTS.length);
  });

  it("names a parent that is itself in the chart", () => {
    for (const seed of DEFAULT_CHART_OF_ACCOUNTS) {
      if (seed.parent !== null) expect(numbers.has(seed.parent), `${seed.accountNumber}`).toBe(true);
    }
  });

  // A child under a parent of a different type would land the same money in two
  // statement sections depending on which row you read.
  it("keeps every child in its parent's own section", () => {
    const typeOf = new Map(DEFAULT_CHART_OF_ACCOUNTS.map((a) => [a.accountNumber, a.type]));
    for (const seed of DEFAULT_CHART_OF_ACCOUNTS) {
      if (seed.parent !== null) expect(typeOf.get(seed.parent), `${seed.accountNumber}`).toBe(seed.type);
    }
  });

  // Every role the posting engine can ask for must land somewhere, or an automatic
  // entry has no target on a freshly provisioned business.
  it("maps every posting role to an account in the chart", () => {
    for (const [role, number] of Object.entries(DEFAULT_ACCOUNT_ROLES)) {
      expect(numbers.has(number), role).toBe(true);
    }
  });

  it("marks every role's default account as a system account, so it cannot be switched off", () => {
    const seedOf = new Map(DEFAULT_CHART_OF_ACCOUNTS.map((a) => [a.accountNumber, a]));
    for (const [role, number] of Object.entries(DEFAULT_ACCOUNT_ROLES)) {
      expect(seedOf.get(number)?.isSystem, role).toBe(true);
    }
  });

  // Input GST is receivable from the tax authority until it is offset; booking it as a
  // liability would net ITC away against output GST and make it unreportable.
  it("keeps input GST on the asset side and GST collected on the liability side", () => {
    const seedOf = new Map(DEFAULT_CHART_OF_ACCOUNTS.map((a) => [a.accountNumber, a]));
    expect(normalBalance(seedOf.get(DEFAULT_ACCOUNT_ROLES.input_gst)!.type)).toBe("debit");
    expect(normalBalance(seedOf.get(DEFAULT_ACCOUNT_ROLES.gst_payable)!.type)).toBe("credit");
  });
});
