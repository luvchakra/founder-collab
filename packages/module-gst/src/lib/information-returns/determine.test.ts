import { describe, expect, it } from "vitest";
import { determineForm1099Obligation } from "./determine";
import type { ResolvedForm1099ThresholdRule, VendorPaymentTotal } from "./types";

const threshold: ResolvedForm1099ThresholdRule = { thresholdUsd: 600, label: "pre-OBBBA threshold", rule: { id: "rule-600" } as never };

function vendor(overrides: Partial<VendorPaymentTotal> = {}): VendorPaymentTotal {
  return { partyId: "party-1", partyName: "Acme Contracting", partyKind: "person", totalPaidUsd: 1000, paymentCount: 3, ...overrides };
}

describe("determineForm1099Obligation", () => {
  it("a company-kind party is always unresolved, regardless of amount or whether a threshold rule exists", () => {
    const result = determineForm1099Obligation(vendor({ partyKind: "company", totalPaidUsd: 100000 }), threshold);
    expect(result).toMatchObject({ resolved: false, obligated: null, ruleRefs: [] });
    expect(result.reason).toMatch(/corporate entity type/i);
  });

  it("a company-kind party with no threshold rule is still unresolved for the same company-kind reason, not the missing-rule one", () => {
    const result = determineForm1099Obligation(vendor({ partyKind: "company" }), null);
    expect(result.reason).toMatch(/corporate entity type/i);
  });

  it("a person-kind party with no threshold rule at all is unresolved", () => {
    const result = determineForm1099Obligation(vendor(), null);
    expect(result).toMatchObject({ resolved: false, obligated: null, thresholdUsd: null, ruleRefs: [] });
    expect(result.reason).toMatch(/no 1099 reporting threshold rule/i);
  });

  it("total payments AT the threshold are obligated (>= , not >, matching the IRS's own '$600 or more' wording)", () => {
    const result = determineForm1099Obligation(vendor({ totalPaidUsd: 600 }), threshold);
    expect(result).toMatchObject({ resolved: true, obligated: true, thresholdUsd: 600, ruleRefs: ["rule-600"] });
  });

  it("total payments above the threshold are obligated", () => {
    expect(determineForm1099Obligation(vendor({ totalPaidUsd: 601 }), threshold).obligated).toBe(true);
  });

  it("total payments below the threshold are not obligated", () => {
    const result = determineForm1099Obligation(vendor({ totalPaidUsd: 599.99 }), threshold);
    expect(result).toMatchObject({ resolved: true, obligated: false });
  });

  it("preserves the vendor's own identity fields on the returned determination", () => {
    const result = determineForm1099Obligation(vendor({ partyId: "party-9", partyName: "Jane Doe" }), threshold);
    expect(result).toMatchObject({ partyId: "party-9", partyName: "Jane Doe" });
  });
});
