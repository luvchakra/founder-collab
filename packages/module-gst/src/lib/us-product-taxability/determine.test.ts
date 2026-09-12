import { describe, expect, it } from "vitest";
import { determineUsProductTaxability } from "./determine";

const generalRule = { ratePercent: 6, rule: { id: "rule-general" } };

describe("determineUsProductTaxability", () => {
  it("an exempt category-specific rule wins outright, rate forced to 0", () => {
    const result = determineUsProductTaxability({
      category: "clothing",
      categoryRule: { treatment: "exempt", ratePercent: null, label: "PA clothing exemption", rule: { id: "rule-pa-clothing" } as never },
      generalRule,
    });
    expect(result).toMatchObject({ category: "clothing", notApplicable: false, resolved: true, treatment: "exempt", ratePercent: 0, ruleRefs: ["rule-pa-clothing"] });
  });

  it("a reduced category-specific rule with its own explicit rate", () => {
    const result = determineUsProductTaxability({
      category: "groceries",
      categoryRule: { treatment: "reduced", ratePercent: 1, label: "Reduced grocery rate", rule: { id: "rule-groceries" } as never },
      generalRule,
    });
    expect(result).toMatchObject({ resolved: true, treatment: "reduced", ratePercent: 1, ruleRefs: ["rule-groceries"] });
  });

  it("a standard category-specific rule with no rate of its own falls back to the general rate and cites both rules", () => {
    const result = determineUsProductTaxability({
      category: "digital_goods",
      categoryRule: { treatment: "standard", ratePercent: null, label: "Digital goods taxable", rule: { id: "rule-digital" } as never },
      generalRule,
    });
    expect(result).toMatchObject({ resolved: true, treatment: "standard", ratePercent: 6, ruleRefs: ["rule-digital", "rule-general"] });
  });

  it("a standard category-specific rule with no rate AND no general rule on file is unresolved", () => {
    const result = determineUsProductTaxability({
      category: "digital_goods",
      categoryRule: { treatment: "standard", ratePercent: null, label: "Digital goods taxable", rule: { id: "rule-digital" } as never },
      generalRule: null,
    });
    expect(result).toMatchObject({ resolved: false, ratePercent: null, ruleRefs: ["rule-digital"] });
  });

  it("no category rule, but a goods-like category and a general rule on file -- falls back to the general rate", () => {
    const result = determineUsProductTaxability({ category: "general", categoryRule: null, generalRule });
    expect(result).toMatchObject({ category: "general", notApplicable: false, resolved: true, treatment: "standard", ratePercent: 6, ruleRefs: ["rule-general"] });
  });

  it("no category rule, goods-like category, and no general rule either -- unresolved, never a guessed rate", () => {
    const result = determineUsProductTaxability({ category: "clothing", categoryRule: null, generalRule: null });
    expect(result).toMatchObject({ resolved: false, treatment: null, ratePercent: null, ruleRefs: [] });
  });

  it("no category rule, service-like category (saas) -- never falls back to the general rate, stays unresolved", () => {
    const result = determineUsProductTaxability({ category: "saas", categoryRule: null, generalRule });
    expect(result).toMatchObject({ category: "saas", resolved: false, treatment: null, ratePercent: null, ruleRefs: [] });
  });

  it("no category rule, service-like category (services) -- same unresolved posture", () => {
    const result = determineUsProductTaxability({ category: "services", categoryRule: null, generalRule });
    expect(result).toMatchObject({ resolved: false, treatment: null, ratePercent: null, ruleRefs: [] });
  });
});
