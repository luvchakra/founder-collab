import { describe, expect, it } from "vitest";
import { computeOfferingDefinitionQuality } from "./definition-quality";
import type { IcpProfile } from "../icp/types";
import type { BuyerPersona } from "../personas/types";
import type { ProductProfile } from "../ai/schemas";

function icpFixture(overrides: Partial<IcpProfile> = {}): IcpProfile {
  return {
    id: "icp-1",
    workspace_id: "w1",
    name: "Test ICP",
    description: null,
    industries: [],
    company_sizes: [],
    geographies: [],
    roles: [],
    pain_points: [],
    buying_signals: [],
    exclusions: [],
    revenue: [],
    business_model: [],
    technology: [],
    growth_stage: [],
    existing_tools: [],
    confidence: null,
    evidence: [],
    status: "draft",
    version: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function personaFixture(overrides: Partial<BuyerPersona> = {}): BuyerPersona {
  return {
    id: "persona-1",
    workspace_id: "w1",
    title: "CISO",
    role_in_committee: "executive_buyer",
    priority: "high",
    notes: null,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function profileFixture(overrides: Partial<ProductProfile> = {}): ProductProfile {
  return {
    description: "",
    category: "B2B SaaS",
    problem: "Problem",
    solution: "Solution",
    features: [],
    differentiators: [],
    target_industries: [],
    target_roles: [],
    use_cases: [],
    pricing_summary: null,
    competitive_positioning: "",
    confidence: 0.5,
    ...overrides,
  };
}

describe("computeOfferingDefinitionQuality", () => {
  it("scores every dimension weak, overall 20, for a completely empty offering", () => {
    const result = computeOfferingDefinitionQuality({
      detailedDescription: null,
      icp: null,
      personas: [],
      productProfile: null,
    });
    expect(result.dimensions).toEqual({
      description: "weak",
      target_customer: "weak",
      icp_evidence: "weak",
      buyer_evidence: "weak",
      differentiation: "weak",
    });
    expect(result.overall).toBe(20);
  });

  it("scores every dimension strong, overall 100, for a fully-defined offering", () => {
    const result = computeOfferingDefinitionQuality({
      detailedDescription:
        "A detailed, well-considered description of the offering spanning well more than fifteen words in total.",
      icp: icpFixture({
        industries: ["Fintech"],
        company_sizes: ["50-200"],
        roles: ["CISO"],
        confidence: 0.9,
        evidence: ["Quote from the product profile."],
      }),
      personas: [personaFixture({ notes: "Owns the security budget." }), personaFixture({ id: "persona-2", title: "IAM Director" })],
      productProfile: profileFixture({
        differentiators: ["Faster onboarding", "Native SSO"],
        competitive_positioning: "Purpose-built for regulated industries, unlike generic tools.",
      }),
    });
    expect(result.dimensions).toEqual({
      description: "strong",
      target_customer: "strong",
      icp_evidence: "strong",
      buyer_evidence: "strong",
      differentiation: "strong",
    });
    expect(result.overall).toBe(100);
  });

  describe("description", () => {
    it("prefers detailedDescription over the AI profile's own description when both exist", () => {
      const long = "word ".repeat(20).trim();
      const result = computeOfferingDefinitionQuality({
        detailedDescription: long,
        icp: null,
        personas: [],
        productProfile: profileFixture({ description: "" }),
      });
      expect(result.dimensions.description).toBe("strong");
    });

    it("falls back to the AI profile's description when there is no detailedDescription", () => {
      const result = computeOfferingDefinitionQuality({
        detailedDescription: null,
        icp: null,
        personas: [],
        productProfile: profileFixture({ description: "word ".repeat(20).trim() }),
      });
      expect(result.dimensions.description).toBe("strong");
    });

    it("is medium for a short, non-empty description", () => {
      const result = computeOfferingDefinitionQuality({
        detailedDescription: "A short one.",
        icp: null,
        personas: [],
        productProfile: null,
      });
      expect(result.dimensions.description).toBe("medium");
    });
  });

  describe("target_customer", () => {
    it("is medium when only some of industries/company sizes/roles are populated", () => {
      const result = computeOfferingDefinitionQuality({
        detailedDescription: null,
        icp: icpFixture({ industries: ["Fintech"] }),
        personas: [],
        productProfile: null,
      });
      expect(result.dimensions.target_customer).toBe("medium");
    });
  });

  describe("icp_evidence", () => {
    it("is weak when confidence was never computed, even if the ICP has fields filled in by hand", () => {
      const result = computeOfferingDefinitionQuality({
        detailedDescription: null,
        icp: icpFixture({ industries: ["Fintech"], roles: ["CISO"], company_sizes: ["50-200"], confidence: null }),
        personas: [],
        productProfile: null,
      });
      expect(result.dimensions.icp_evidence).toBe("weak");
    });

    it("is medium for a mid-range confidence with no evidence quotes", () => {
      const result = computeOfferingDefinitionQuality({
        detailedDescription: null,
        icp: icpFixture({ confidence: 0.5, evidence: [] }),
        personas: [],
        productProfile: null,
      });
      expect(result.dimensions.icp_evidence).toBe("medium");
    });
  });

  describe("buyer_evidence", () => {
    it("is medium for personas with no notes on any of them", () => {
      const result = computeOfferingDefinitionQuality({
        detailedDescription: null,
        icp: null,
        personas: [personaFixture(), personaFixture({ id: "p2" })],
        productProfile: null,
      });
      expect(result.dimensions.buyer_evidence).toBe("medium");
    });

    it("is weak for zero personas", () => {
      const result = computeOfferingDefinitionQuality({
        detailedDescription: null,
        icp: null,
        personas: [],
        productProfile: null,
      });
      expect(result.dimensions.buyer_evidence).toBe("weak");
    });
  });

  describe("differentiation", () => {
    it("is medium when only differentiators are populated, with no real positioning statement", () => {
      const result = computeOfferingDefinitionQuality({
        detailedDescription: null,
        icp: null,
        personas: [],
        productProfile: profileFixture({ differentiators: ["A", "B"], competitive_positioning: "" }),
      });
      expect(result.dimensions.differentiation).toBe("medium");
    });

    it("is medium when only a real positioning statement is populated, with no differentiator list", () => {
      const result = computeOfferingDefinitionQuality({
        detailedDescription: null,
        icp: null,
        personas: [],
        productProfile: profileFixture({ differentiators: [], competitive_positioning: "Purpose-built for teams in regulated industries." }),
      });
      expect(result.dimensions.differentiation).toBe("medium");
    });
  });
});
