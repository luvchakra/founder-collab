import { describe, expect, it } from "vitest";
import { deriveActivationSteps } from "./derive";
import type { ActivationSettings } from "./types";

function settings(overrides: Partial<ActivationSettings> = {}): ActivationSettings {
  return { accountingMethod: "accrual", fiscalYearStartMonth: 4, ...overrides };
}

function inputs(overrides: Partial<Parameters<typeof deriveActivationSteps>[0]> = {}) {
  return {
    businessName: "Acme Co",
    settings: settings(),
    accountCount: 0,
    mappedRoleCount: 0,
    hasGstin: false,
    bankAccountCount: 0,
    ...overrides,
  };
}

describe("deriveActivationSteps", () => {
  it("always has 8 steps, in the same order every time", () => {
    const steps = deriveActivationSteps(inputs());
    expect(steps.map((s) => s.key)).toEqual([
      "business_profile",
      "accounting_method",
      "fiscal_year",
      "chart_of_accounts",
      "gst_profile",
      "account_mappings",
      "opening_balances",
      "bank_accounts",
    ]);
  });

  it("business profile, accounting method and fiscal year are always complete", () => {
    const steps = deriveActivationSteps(inputs());
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(byKey.business_profile!.complete).toBe(true);
    expect(byKey.accounting_method!.complete).toBe(true);
    expect(byKey.fiscal_year!.complete).toBe(true);
  });

  it("shows the fiscal year's own start month by name", () => {
    const steps = deriveActivationSteps(inputs({ settings: settings({ fiscalYearStartMonth: 1 }) }));
    expect(steps.find((s) => s.key === "fiscal_year")!.detail).toBe("Starts in January");
  });

  it("shows the chosen accounting method", () => {
    const steps = deriveActivationSteps(inputs({ settings: settings({ accountingMethod: "cash" }) }));
    expect(steps.find((s) => s.key === "accounting_method")!.detail).toBe("Cash");
  });

  it("chart of accounts and opening balances are both incomplete with zero accounts, complete with any", () => {
    const withNone = deriveActivationSteps(inputs({ accountCount: 0 }));
    expect(withNone.find((s) => s.key === "chart_of_accounts")!.complete).toBe(false);
    expect(withNone.find((s) => s.key === "opening_balances")!.complete).toBe(false);

    const withSome = deriveActivationSteps(inputs({ accountCount: 5 }));
    expect(withSome.find((s) => s.key === "chart_of_accounts")!.complete).toBe(true);
    expect(withSome.find((s) => s.key === "opening_balances")!.complete).toBe(true);
  });

  it("GST profile is complete only when a GSTIN is on file", () => {
    expect(deriveActivationSteps(inputs({ hasGstin: false })).find((s) => s.key === "gst_profile")!.complete).toBe(false);
    expect(deriveActivationSteps(inputs({ hasGstin: true })).find((s) => s.key === "gst_profile")!.complete).toBe(true);
  });

  it("account mappings need every one of the 10 roles mapped, not just some", () => {
    const partial = deriveActivationSteps(inputs({ mappedRoleCount: 9 }));
    expect(partial.find((s) => s.key === "account_mappings")!.complete).toBe(false);
    expect(partial.find((s) => s.key === "account_mappings")!.detail).toBe("9 of 10 roles mapped");

    const full = deriveActivationSteps(inputs({ mappedRoleCount: 10 }));
    expect(full.find((s) => s.key === "account_mappings")!.complete).toBe(true);
  });

  it("bank accounts is complete only with at least one", () => {
    expect(deriveActivationSteps(inputs({ bankAccountCount: 0 })).find((s) => s.key === "bank_accounts")!.complete).toBe(false);
    expect(deriveActivationSteps(inputs({ bankAccountCount: 2 })).find((s) => s.key === "bank_accounts")!.detail).toBe("2 accounts");
  });
});
