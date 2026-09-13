import { describe, expect, it } from "vitest";
import { detectIcpFieldCorrections, type IcpContentFields } from "./offering-feedback";

function baseFields(overrides: Partial<IcpContentFields> = {}): IcpContentFields {
  return {
    name: "Mid-market SaaS",
    description: "Sells to mid-market software teams.",
    industries: ["Retail"],
    company_sizes: ["50-200"],
    geographies: ["United States"],
    roles: ["VP Sales"],
    pain_points: ["Manual outreach"],
    buying_signals: ["Recent funding"],
    exclusions: ["Enterprise"],
    revenue: ["$1M-$10M"],
    business_model: ["B2B SaaS"],
    technology: ["Salesforce"],
    growth_stage: ["Series A"],
    existing_tools: ["HubSpot"],
    ...overrides,
  };
}

describe("detectIcpFieldCorrections", () => {
  it("returns nothing when the founder saved the AI's values unchanged", () => {
    const fields = baseFields();
    expect(detectIcpFieldCorrections(fields, { ...fields })).toEqual([]);
  });

  it("reproduces the doc's own worked example -- one list field corrected", () => {
    const ai = baseFields({ industries: ["Retail"] });
    const user = baseFields({ industries: ["Banking"] });
    expect(detectIcpFieldCorrections(ai, user)).toEqual([
      { field: "industries", aiValue: ["Retail"], userValue: ["Banking"] },
    ]);
  });

  it("detects a scalar field correction, including null-to-value", () => {
    const ai = baseFields({ description: null });
    const user = baseFields({ description: "Sells to enterprise IT teams." });
    expect(detectIcpFieldCorrections(ai, user)).toEqual([
      { field: "description", aiValue: null, userValue: "Sells to enterprise IT teams." },
    ]);
  });

  it("reports every field that changed, in field-declaration order, when several are corrected", () => {
    const ai = baseFields();
    const user = baseFields({ industries: ["Banking"], roles: ["CFO"] });
    expect(detectIcpFieldCorrections(ai, user)).toEqual([
      { field: "industries", aiValue: ["Retail"], userValue: ["Banking"] },
      { field: "roles", aiValue: ["VP Sales"], userValue: ["CFO"] },
    ]);
  });

  it("treats a same-elements-different-order list as a correction -- exact order comparison, not a set comparison", () => {
    const ai = baseFields({ industries: ["Retail", "Healthcare"] });
    const user = baseFields({ industries: ["Healthcare", "Retail"] });
    expect(detectIcpFieldCorrections(ai, user)).toEqual([
      { field: "industries", aiValue: ["Retail", "Healthcare"], userValue: ["Healthcare", "Retail"] },
    ]);
  });

  it("ignores an emptied-then-refilled field that lands back on the same value", () => {
    const fields = baseFields({ exclusions: [] });
    expect(detectIcpFieldCorrections(fields, { ...fields, exclusions: [] })).toEqual([]);
  });
});
