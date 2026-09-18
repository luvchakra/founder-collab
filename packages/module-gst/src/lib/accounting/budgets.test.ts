import { describe, expect, it } from "vitest";
import { notableVariances, summariseBudget, varianceFor, type BudgetLine } from "./budgets";
import type { AccountType } from "./types";

const line = (
  accountNumber: string,
  type: AccountType,
  budgeted: number,
  actual: number,
): BudgetLine => ({ accountId: accountNumber, accountNumber, name: `Account ${accountNumber}`, type, budgeted, actual });

describe("which direction is good", () => {
  // Same arithmetic sign, opposite meaning. Getting this backwards congratulates a
  // business on missing its revenue target.
  it("calls underspending on an expense favourable", () => {
    expect(varianceFor(line("6200", "expense", 10000, 8000)).direction).toBe("favourable");
  });

  it("calls overspending on an expense adverse", () => {
    expect(varianceFor(line("6200", "expense", 10000, 12000)).direction).toBe("adverse");
  });

  it("calls earning less than budgeted adverse", () => {
    expect(varianceFor(line("4200", "income", 100000, 80000)).direction).toBe("adverse");
  });

  it("calls earning more than budgeted favourable", () => {
    expect(varianceFor(line("4200", "income", 100000, 120000)).direction).toBe("favourable");
  });

  it("treats cost of sales like an expense, not like income", () => {
    expect(varianceFor(line("5100", "cogs", 5000, 7000)).direction).toBe("adverse");
  });

  it("says on budget when it is exactly on budget", () => {
    expect(varianceFor(line("6200", "expense", 10000, 10000)).direction).toBe("on_budget");
  });

  it("does not call a paisa of floating point a variance", () => {
    expect(varianceFor(line("6200", "expense", 0.3, 0.1 + 0.2)).direction).toBe("on_budget");
  });
});

describe("variance as a share of budget", () => {
  it("is the overspend over the budget", () => {
    expect(varianceFor(line("6200", "expense", 10000, 12000)).percentOfBudget).toBe(20);
  });

  // "Infinitely over budget" is noise, not information.
  it("is nothing at all when nothing was budgeted", () => {
    expect(varianceFor(line("6200", "expense", 0, 5000)).percentOfBudget).toBeNull();
  });
});

describe("totals across account types", () => {
  const lines = [
    line("4200", "income", 100000, 90000),
    line("5100", "cogs", 30000, 28000),
    line("6200", "expense", 20000, 25000),
  ];
  const summary = summariseBudget(lines);

  // Summing income and expense budgets together would be nonsense; profit is the only
  // total that means anything across types.
  it("reports budgeted and actual profit, not a meaningless grand total", () => {
    expect(summary.budgetedProfit).toBe(50000);
    expect(summary.actualProfit).toBe(37000);
  });

  it("reports missing the profit budget as adverse", () => {
    expect(summary.profitVariance).toBe(-13000);
    expect(summary.profitDirection).toBe("adverse");
  });

  it("reports beating it as favourable", () => {
    const good = summariseBudget([line("4200", "income", 100, 200), line("6200", "expense", 50, 40)]);
    expect(good.profitDirection).toBe("favourable");
  });

  it("orders rows by account number", () => {
    expect(summary.rows.map((r) => r.accountNumber)).toEqual(["4200", "5100", "6200"]);
  });

  it("handles a budget with nothing in it", () => {
    const empty = summariseBudget([]);
    expect(empty.budgetedProfit).toBe(0);
    expect(empty.profitDirection).toBe("on_budget");
  });
});

describe("what is worth looking at", () => {
  const summary = summariseBudget([
    line("4200", "income", 100000, 90000), // adverse by 10,000
    line("6200", "expense", 20000, 45000), // adverse by 25,000
    line("6300", "expense", 5000, 4000), // favourable
    line("6400", "expense", 1000, 1500), // adverse by 500
  ]);

  // A report that lists forty accounts in number order buries the three that matter.
  it("leads with the biggest adverse variance", () => {
    expect(notableVariances(summary)[0]!.accountNumber).toBe("6200");
  });

  it("never lists something that went well", () => {
    expect(notableVariances(summary).every((r) => r.direction === "adverse")).toBe(true);
  });

  it("caps how many it raises", () => {
    expect(notableVariances(summary, 2)).toHaveLength(2);
  });

  it("has nothing to raise when everything is on or under budget", () => {
    expect(notableVariances(summariseBudget([line("6200", "expense", 100, 50)]))).toEqual([]);
  });
});
