import { describe, expect, it } from "vitest";
import { EU_MEMBER_STATE_CODES, EU_WIDE_RULE_COUNTRY, isEuMemberState } from "./eu";

describe("isEuMemberState", () => {
  it("is true for every one of this build's five supported EU country packs", () => {
    for (const code of ["DE", "FR", "BE", "PL", "IT"]) {
      expect(isEuMemberState(code)).toBe(true);
    }
  });

  it("is true for an EU member state this build has no working country pack for yet", () => {
    expect(isEuMemberState("NL")).toBe(true);
  });

  it("is false for a non-EU country, including a post-Brexit UK", () => {
    expect(isEuMemberState("IN")).toBe(false);
    expect(isEuMemberState("US")).toBe(false);
    expect(isEuMemberState("GB")).toBe(false);
  });

  it("is false for an unrecognized code", () => {
    expect(isEuMemberState("ZZ")).toBe(false);
    expect(isEuMemberState("")).toBe(false);
  });

  it("lists exactly 27 member states with no duplicates", () => {
    expect(EU_MEMBER_STATE_CODES.length).toBe(27);
    expect(new Set(EU_MEMBER_STATE_CODES).size).toBe(27);
  });

  it("the pan-EU rule sentinel is a two-letter code but not itself a member state", () => {
    expect(EU_WIDE_RULE_COUNTRY).toBe("EU");
    expect(isEuMemberState(EU_WIDE_RULE_COUNTRY)).toBe(false);
  });
});
