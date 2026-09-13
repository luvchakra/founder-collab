import { describe, expect, it } from "vitest";
import { identifyMissingOfferingInformation } from "./missing-information";
import type { IcpProfile } from "../icp/types";
import type { BuyerPersona } from "../personas/types";

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

describe("identifyMissingOfferingInformation", () => {
  it("flags every field when there is no ICP and no personas at all", () => {
    const result = identifyMissingOfferingInformation({ icp: null, personas: [] });
    expect(result.map((item) => item.field).sort()).toEqual(
      ["customer_size", "geographic_focus", "primary_buyer", "target_industries"].sort(),
    );
  });

  it("flags nothing when every relevant field is populated", () => {
    const result = identifyMissingOfferingInformation({
      icp: icpFixture({ industries: ["Fintech"], company_sizes: ["50-200"], geographies: ["US"], roles: ["CISO"] }),
      personas: [],
    });
    expect(result).toEqual([]);
  });

  it("does not flag primary buyer when the ICP has no roles but a buyer persona exists", () => {
    const result = identifyMissingOfferingInformation({
      icp: icpFixture({ industries: ["Fintech"], company_sizes: ["50-200"], geographies: ["US"], roles: [] }),
      personas: [personaFixture()],
    });
    expect(result).toEqual([]);
  });

  it("flags exactly the doc's own three named gaps when only those fields are empty", () => {
    const result = identifyMissingOfferingInformation({
      icp: icpFixture({ industries: ["Fintech"], company_sizes: [], geographies: [], roles: [] }),
      personas: [],
    });
    expect(result.map((item) => item.label).sort()).toEqual(["Geographic focus", "Ideal customer size", "Primary buyer"].sort());
  });

  it("returns labels matching the doc's own literal wording", () => {
    const result = identifyMissingOfferingInformation({ icp: null, personas: [] });
    const labels = result.map((item) => item.label);
    expect(labels).toContain("Ideal customer size");
    expect(labels).toContain("Primary buyer");
    expect(labels).toContain("Geographic focus");
  });
});
