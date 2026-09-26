import { describe, expect, it } from "vitest";
import { bankRuleProblems, categorisationLines, findMatchingRule, ruleMatches, type BankRule } from "./bank-rules";
import { checkBalanced } from "./balance";

// FIN-8 — bank rules.

const rule = (overrides: Partial<BankRule> = {}): BankRule => ({
  id: "r1",
  name: "Cloud hosting",
  matchText: "aws",
  direction: "out",
  minAmount: null,
  maxAmount: null,
  accountId: "software",
  partyId: null,
  priority: 100,
  isActive: true,
  ...overrides,
});

describe("ruleMatches", () => {
  it("matches its text anywhere in the description, ignoring case and spacing", () => {
    expect(ruleMatches(rule(), { description: "POS  AWS EMEA  1234", amount: -500 })).toBe(true);
    expect(ruleMatches(rule({ matchText: "office  rent" }), { description: "NEFT OFFICE RENT SEPT", amount: -500 })).toBe(true);
  });

  it("respects the direction money moved", () => {
    expect(ruleMatches(rule(), { description: "AWS refund", amount: 50 })).toBe(false);
    expect(ruleMatches(rule({ direction: "in" }), { description: "AWS refund", amount: 50 })).toBe(true);
    expect(ruleMatches(rule({ direction: "any" }), { description: "AWS", amount: -1 })).toBe(true);
  });

  it("respects the amount bounds on the line's size", () => {
    const bounded = rule({ minAmount: 100, maxAmount: 1000 });
    expect(ruleMatches(bounded, { description: "AWS", amount: -99.99 })).toBe(false);
    expect(ruleMatches(bounded, { description: "AWS", amount: -100 })).toBe(true);
    expect(ruleMatches(bounded, { description: "AWS", amount: -1000.01 })).toBe(false);
  });

  it("never matches while paused", () => {
    expect(ruleMatches(rule({ isActive: false }), { description: "AWS", amount: -5 })).toBe(false);
  });
});

describe("findMatchingRule", () => {
  it("takes the lowest priority first, then the name, whatever the input order", () => {
    const rules = [rule({ id: "b", name: "B", priority: 50 }), rule({ id: "a", name: "A", priority: 50 }), rule({ id: "z", priority: 10, matchText: "nothing" })];
    expect(findMatchingRule(rules, { description: "AWS", amount: -5 })?.id).toBe("a");
  });

  it("returns null when nothing fits", () => {
    expect(findMatchingRule([rule()], { description: "Salary", amount: -5 })).toBeNull();
  });
});

describe("categorisationLines", () => {
  it("credits the bank for money out and debits the rule's account, carrying the party", () => {
    const lines = categorisationLines(rule({ partyId: "amazon" }), "bank", -1180, "AWS");
    expect(lines).toEqual([
      { accountId: "bank", debit: 0, credit: 1180, memo: "AWS" },
      { accountId: "software", debit: 1180, credit: 0, memo: "AWS", partyId: "amazon" },
    ]);
    expect(checkBalanced(lines).balanced).toBe(true);
  });

  it("debits the bank for money in", () => {
    const [bank, counter] = categorisationLines(rule({ direction: "in", accountId: "interest" }), "bank", 42.5, "Interest");
    expect(bank).toMatchObject({ debit: 42.5, credit: 0 });
    expect(counter).toMatchObject({ accountId: "interest", debit: 0, credit: 42.5 });
  });
});

describe("bankRuleProblems", () => {
  const ok = { name: "Rent", matchText: "rent", direction: "out", minAmount: null, maxAmount: null, accountId: "a", priority: 100 };

  it("accepts a complete rule", () => {
    expect(bankRuleProblems(ok)).toEqual([]);
  });

  it("lists every problem at once", () => {
    const problems = bankRuleProblems({ ...ok, name: " ", matchText: "r", accountId: "", minAmount: 10, maxAmount: 5, priority: -1 });
    expect(problems).toHaveLength(5);
  });
});
