import { describe, expect, it } from "vitest";
import { passesIcpPreFilter, type IcpPreFilterCriteria } from "./icp-pre-filter";

const EMPTY_CRITERIA: IcpPreFilterCriteria = { industries: [], geographies: [], companySizes: [], exclusions: [] };

describe("passesIcpPreFilter", () => {
  it("passes everything when the ICP has no restrictions set", () => {
    expect(passesIcpPreFilter(EMPTY_CRITERIA, { industry: "Retail", location: "Toronto", companySize: "50-200" })).toEqual({
      passes: true,
      reason: null,
    });
  });

  it("never guesses a rejection when the candidate's own attribute is unknown", () => {
    const criteria: IcpPreFilterCriteria = { ...EMPTY_CRITERIA, industries: ["Financial Services"] };
    expect(passesIcpPreFilter(criteria, { industry: null, location: null, companySize: null }).passes).toBe(true);
  });

  it("rejects a known industry that doesn't match the ICP's own list", () => {
    const criteria: IcpPreFilterCriteria = { ...EMPTY_CRITERIA, industries: ["Financial Services"] };
    expect(passesIcpPreFilter(criteria, { industry: "Retail", location: null, companySize: null })).toEqual({
      passes: false,
      reason: 'Industry "Retail" does not match the ICP\'s own industries list.',
    });
  });

  it("matches industry case-insensitively via substring", () => {
    const criteria: IcpPreFilterCriteria = { ...EMPTY_CRITERIA, industries: ["financial"] };
    expect(passesIcpPreFilter(criteria, { industry: "Financial Services", location: null, companySize: null }).passes).toBe(true);
  });

  it("rejects a known location that doesn't match the ICP's own geographies", () => {
    const criteria: IcpPreFilterCriteria = { ...EMPTY_CRITERIA, geographies: ["Canada"] };
    expect(passesIcpPreFilter(criteria, { industry: null, location: "Berlin, Germany", companySize: null }).passes).toBe(false);
  });

  it("rejects a known company size that doesn't match the ICP's own list", () => {
    const criteria: IcpPreFilterCriteria = { ...EMPTY_CRITERIA, companySizes: ["1000+"] };
    expect(passesIcpPreFilter(criteria, { industry: null, location: null, companySize: "1-10" }).passes).toBe(false);
  });

  it("exclusions win outright, even over an otherwise-matching profile", () => {
    const criteria: IcpPreFilterCriteria = { ...EMPTY_CRITERIA, industries: ["Retail"], exclusions: ["Acme"] };
    expect(passesIcpPreFilter(criteria, { industry: "Acme Retail Holdings", location: null, companySize: null })).toEqual({
      passes: false,
      reason: "Excluded by the ICP's own exclusion list.",
    });
  });
});
