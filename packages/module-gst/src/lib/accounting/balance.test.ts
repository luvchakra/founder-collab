import { describe, expect, it } from "vitest";
import { checkBalanced, isPeriodPostable, normalBalance, signedBalance } from "./balance";
import { DEFAULT_ACCOUNT_ROLES, DEFAULT_CHART_OF_ACCOUNTS } from "./chart-of-accounts";
import type { AccountType } from "./types";

const line = (debit: number, credit: number) => ({ accountId: "a", debit, credit });

describe("normalBalance", () => {
  it("puts assets and costs on the debit side", () => {
    for (const type of ["asset", "expense", "cogs"] as AccountType[]) {
      expect(normalBalance(type)).toBe("debit");
    }
  });

  it("puts liabilities, equity and income on the credit side", () => {
    for (const type of ["liability", "equity", "income"] as AccountType[]) {
      expect(normalBalance(type)).toBe("credit");
    }
  });
});

describe("signedBalance", () => {
  // Both of these are "money the statement reports as a positive number", even though
  // they accumulate on opposite sides of the ledger.
  it("reports a funded bank account and an owed payable both as positive", () => {
    expect(signedBalance("asset", 5000, 1200)).toBe(3800);
    expect(signedBalance("liability", 1200, 5000)).toBe(3800);
  });

  it("goes negative when an account is on the wrong side of its own normal balance", () => {
    expect(signedBalance("asset", 100, 400)).toBe(-300);
  });
});

describe("checkBalanced (the General Ledger's central invariant)", () => {
  it("accepts a balanced two-line entry", () => {
    const result = checkBalanced([line(1000, 0), line(0, 1000)]);
    expect(result.balanced).toBe(true);
    expect(result.difference).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it("accepts a balanced multi-line entry (invoice with split GST)", () => {
    // Dr A/R 1180, Cr Revenue 1000, Cr CGST 90, Cr SGST 90.
    const result = checkBalanced([line(1180, 0), line(0, 1000), line(0, 90), line(0, 90)]);
    expect(result.balanced).toBe(true);
    expect(result.totalDebit).toBe(1180);
    expect(result.totalCredit).toBe(1180);
  });

  it("rejects an unbalanced entry and says by how much", () => {
    const result = checkBalanced([line(1000, 0), line(0, 900)]);
    expect(result.balanced).toBe(false);
    expect(result.difference).toBe(100);
    expect(result.errors.join(" ")).toContain("100");
  });

  // 0.1 + 0.2 !== 0.3 in binary floating point, so a journal correct to the rupee can
  // still fail a naive equality check on its totals.
  it("does not report a rounding artefact as an imbalance", () => {
    const result = checkBalanced([line(0.1, 0), line(0.2, 0), line(0, 0.3)]);
    expect(result.balanced).toBe(true);
    expect(result.difference).toBe(0);
  });

  it("rejects a single-line entry", () => {
    const result = checkBalanced([line(100, 0)]);
    expect(result.balanced).toBe(false);
    expect(result.errors.join(" ")).toContain("at least two lines");
  });

  it("rejects a line carrying both a debit and a credit", () => {
    const result = checkBalanced([line(100, 100), line(0, 100)]);
    expect(result.balanced).toBe(false);
    expect(result.errors.join(" ")).toContain("not both");
  });

  it("rejects an empty line", () => {
    const result = checkBalanced([line(100, 0), line(0, 100), line(0, 0)]);
    expect(result.balanced).toBe(false);
    expect(result.errors.join(" ")).toContain("Line 3");
  });

  it("rejects negative amounts", () => {
    const result = checkBalanced([line(-100, 0), line(0, -100)]);
    expect(result.balanced).toBe(false);
    expect(result.errors.join(" ")).toContain("negative");
  });

  it("reports every problem at once rather than only the first", () => {
    const result = checkBalanced([line(0, 0)]);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe("isPeriodPostable", () => {
  it("allows postings into an open or under-review period", () => {
    expect(isPeriodPostable("open")).toBe(true);
    expect(isPeriodPostable("review")).toBe(true);
  });

  it("refuses postings into a locked, filed or closed period", () => {
    expect(isPeriodPostable("locked")).toBe(false);
    expect(isPeriodPostable("filed")).toBe(false);
    expect(isPeriodPostable("closed")).toBe(false);
  });

  it("allows postings when no period has been defined yet", () => {
    expect(isPeriodPostable(null)).toBe(true);
    expect(isPeriodPostable(undefined)).toBe(true);
  });
});

describe("DEFAULT_CHART_OF_ACCOUNTS", () => {
  it("has unique account numbers", () => {
    const numbers = DEFAULT_CHART_OF_ACCOUNTS.map((a) => a.accountNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("only parents accounts onto accounts that exist", () => {
    const numbers = new Set(DEFAULT_CHART_OF_ACCOUNTS.map((a) => a.accountNumber));
    for (const account of DEFAULT_CHART_OF_ACCOUNTS) {
      if (account.parent === null) continue;
      expect(numbers, `${account.name} parents onto a missing account`).toContain(account.parent);
    }
  });

  it("gives every child the same type as its parent section", () => {
    const byNumber = new Map(DEFAULT_CHART_OF_ACCOUNTS.map((a) => [a.accountNumber, a]));
    for (const account of DEFAULT_CHART_OF_ACCOUNTS) {
      if (account.parent === null) continue;
      expect(byNumber.get(account.parent)?.type).toBe(account.type);
    }
  });

  it("covers all six statement sections at the top level", () => {
    const roots = DEFAULT_CHART_OF_ACCOUNTS.filter((a) => a.parent === null).map((a) => a.type);
    expect(roots.sort()).toEqual(["asset", "cogs", "equity", "expense", "income", "liability"]);
  });

  // Every role the posting engine can ask for has to resolve on a fresh chart, or a
  // newly activated business cannot post its first invoice.
  it("resolves every posting role to a real default account", () => {
    const numbers = new Set(DEFAULT_CHART_OF_ACCOUNTS.map((a) => a.accountNumber));
    for (const [role, accountNumber] of Object.entries(DEFAULT_ACCOUNT_ROLES)) {
      expect(numbers, `role ${role} maps to missing account ${accountNumber}`).toContain(accountNumber);
    }
  });

  it("maps every posting role onto an account of a sensible type", () => {
    const byNumber = new Map(DEFAULT_CHART_OF_ACCOUNTS.map((a) => [a.accountNumber, a]));
    const expected: Record<string, AccountType> = {
      accounts_receivable: "asset",
      accounts_payable: "liability",
      bank: "asset",
      cash: "asset",
      inventory_asset: "asset",
      gst_payable: "liability",
      input_gst: "asset",
      product_revenue: "income",
      service_revenue: "income",
      product_cogs: "cogs",
    };
    for (const [role, accountNumber] of Object.entries(DEFAULT_ACCOUNT_ROLES)) {
      expect(byNumber.get(accountNumber)?.type, `role ${role}`).toBe(expected[role]);
    }
  });

  it("marks the accounts the posting engine depends on as system accounts", () => {
    const byNumber = new Map(DEFAULT_CHART_OF_ACCOUNTS.map((a) => [a.accountNumber, a]));
    for (const accountNumber of Object.values(DEFAULT_ACCOUNT_ROLES)) {
      // Input GST maps onto "Other Current Assets" by default, which is a general-purpose
      // account a business may legitimately retire once it creates a dedicated one.
      if (accountNumber === DEFAULT_ACCOUNT_ROLES.input_gst) continue;
      expect(byNumber.get(accountNumber)?.isSystem, `account ${accountNumber}`).toBe(true);
    }
  });
});
