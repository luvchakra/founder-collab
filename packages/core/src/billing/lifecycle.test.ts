import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIFECYCLE_SETTINGS,
  describeSubscriptionTax,
  isEntitledNow,
  isSupportedCurrency,
  isTrialEligible,
  toLifecycleSettings,
  trialEntitlements,
} from "./lifecycle";
import { pastDueSinceField } from "./sync";

const settings = { ...DEFAULT_LIFECYCLE_SETTINGS, trialDays: 14, trialPlanIds: ["plan-pro"], paymentGraceDays: 7 };
const NOW = new Date("2026-10-10T00:00:00Z");

describe("PLATFORM-P1-04.2 trials", () => {
  it("offers a trial only on eligible plans, when trials are on, once per business", () => {
    expect(isTrialEligible(settings, "plan-pro", false)).toBe(true);
    expect(isTrialEligible(settings, "plan-max", false)).toBe(false);
    expect(isTrialEligible(settings, "plan-pro", true)).toBe(false);
    expect(isTrialEligible({ ...settings, trialDays: 0 }, "plan-pro", false)).toBe(false);
  });

  it("limits a trial to the configured modules, or the full plan when none are set", () => {
    expect(trialEntitlements(["crm", "discovery", "fsm"], settings)).toEqual(["crm", "discovery", "fsm"]);
    expect(trialEntitlements(["crm", "discovery", "fsm"], { ...settings, trialModuleKeys: ["discovery"] })).toEqual(["discovery"]);
  });
});

describe("PLATFORM-P1-04.3 payment grace", () => {
  it("keeps a past_due subscription entitled only inside the payment grace", () => {
    expect(isEntitledNow("past_due", "2026-10-05T00:00:00Z", settings, NOW)).toBe(true);
    expect(isEntitledNow("past_due", "2026-10-02T00:00:00Z", settings, NOW)).toBe(false);
    expect(isEntitledNow("past_due", null, settings, NOW)).toBe(true);
    expect(isEntitledNow("active", "2026-01-01T00:00:00Z", settings, NOW)).toBe(true);
    expect(isEntitledNow("cancelled", null, settings, NOW)).toBe(false);
  });

  it("stamps past_due_since on entry, keeps it while past_due, clears it after", () => {
    expect(pastDueSinceField("active", "past_due", NOW)).toEqual({ past_due_since: NOW.toISOString() });
    expect(pastDueSinceField("past_due", "past_due", NOW)).toEqual({});
    expect(pastDueSinceField("past_due", "active", NOW)).toEqual({ past_due_since: null });
  });

  it("never lets the feature grace drop below ADR-9's 30 days", () => {
    expect(toLifecycleSettings({ feature_grace_days: 10 }).featureGraceDays).toBe(30);
    expect(toLifecycleSettings({ feature_grace_days: 45 }).featureGraceDays).toBe(45);
    expect(toLifecycleSettings(null)).toEqual(DEFAULT_LIFECYCLE_SETTINGS);
  });
});

describe("PLATFORM-P1-05.1 currency", () => {
  it("accepts only the platform's supported currencies", () => {
    expect(isSupportedCurrency(settings, "inr")).toBe(true);
    expect(isSupportedCurrency({ supportedCurrencies: ["INR"] }, "USD")).toBe(false);
  });
});

describe("PLATFORM-P1-05.3 subscription tax", () => {
  it("never invents a figure in provider mode", () => {
    expect(describeSubscriptionTax(settings, 2999)).toMatchObject({ taxAmount: null, total: null });
  });

  it("adds exclusive tax and backs inclusive tax out of the price", () => {
    expect(describeSubscriptionTax({ taxMode: "exclusive", taxLabel: "GST", taxRatePercent: 18 }, 1000)).toMatchObject({ label: "GST", taxAmount: 180, total: 1180 });
    expect(describeSubscriptionTax({ taxMode: "inclusive", taxLabel: "GST", taxRatePercent: 18 }, 1180)).toMatchObject({ taxAmount: 180, total: 1180 });
    expect(describeSubscriptionTax({ taxMode: "none", taxLabel: null, taxRatePercent: null }, 500)).toMatchObject({ taxAmount: 0, total: 500 });
  });
});
