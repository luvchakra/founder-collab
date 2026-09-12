import { describe, expect, it } from "vitest";
import { classifyGstr3bInterStateBucket, classifyGstr3bOutwardDocument } from "./classify";

const VALID_GSTIN = "27AAPFU0939F1ZV";

describe("classifyGstr3bOutwardDocument", () => {
  it("is zero_rated for an export", () => {
    expect(classifyGstr3bOutwardDocument("export")).toBe("zero_rated");
  });

  it("is excluded_unknown_place_of_supply when unresolved", () => {
    expect(classifyGstr3bOutwardDocument("unknown")).toBe("excluded_unknown_place_of_supply");
  });

  it("is taxable_other for an intra-state supply", () => {
    expect(classifyGstr3bOutwardDocument("intra_state")).toBe("taxable_other");
  });

  it("is taxable_other for an inter-state supply (no registered/unregistered split at this level)", () => {
    expect(classifyGstr3bOutwardDocument("inter_state")).toBe("taxable_other");
  });
});

describe("classifyGstr3bInterStateBucket", () => {
  it("is not_applicable for an intra-state supply, regardless of registration", () => {
    expect(classifyGstr3bInterStateBucket({ placeOfSupply: "intra_state", gstin: null, gstRegistrationType: "unregistered" })).toBe(
      "not_applicable",
    );
  });

  it("is not_applicable for an export", () => {
    expect(classifyGstr3bInterStateBucket({ placeOfSupply: "export", gstin: null, gstRegistrationType: null })).toBe("not_applicable");
  });

  it("is not_applicable for an inter-state supply to a validly-registered regular recipient", () => {
    expect(classifyGstr3bInterStateBucket({ placeOfSupply: "inter_state", gstin: VALID_GSTIN, gstRegistrationType: "regular" })).toBe(
      "not_applicable",
    );
  });

  it("is composition for an inter-state supply to a composition dealer, even with a valid GSTIN", () => {
    expect(classifyGstr3bInterStateBucket({ placeOfSupply: "inter_state", gstin: VALID_GSTIN, gstRegistrationType: "composition" })).toBe(
      "composition",
    );
  });

  it("is unregistered for an inter-state supply with no GSTIN on file", () => {
    expect(classifyGstr3bInterStateBucket({ placeOfSupply: "inter_state", gstin: null, gstRegistrationType: null })).toBe("unregistered");
  });

  it("is unregistered for an inter-state supply with an invalid GSTIN string", () => {
    expect(
      classifyGstr3bInterStateBucket({ placeOfSupply: "inter_state", gstin: "not-a-real-gstin", gstRegistrationType: "regular" }),
    ).toBe("unregistered");
  });
});
