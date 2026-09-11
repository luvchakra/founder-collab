import { describe, expect, it } from "vitest";
import { canonicalJurisdictionName, getJurisdictions, isJurisdictionSupported } from "./jurisdictions";

describe("compliance jurisdiction catalog", () => {
  it("has 36 Indian states/UTs, all at state level, no duplicates", () => {
    const jurisdictions = getJurisdictions("IN");
    expect(jurisdictions.length).toBe(36);
    expect(jurisdictions.every((j) => j.level === "state")).toBe(true);
    const names = jurisdictions.map((j) => j.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("Maharashtra");
  });

  it("returns no jurisdictions for a planned-but-unimplemented country", () => {
    expect(getJurisdictions("US")).toEqual([]);
    expect(getJurisdictions("CA")).toEqual([]);
  });

  it("returns no jurisdictions for an unknown country code", () => {
    expect(getJurisdictions("ZZ")).toEqual([]);
  });

  it("isJurisdictionSupported matches an Indian state case-insensitively", () => {
    expect(isJurisdictionSupported("IN", "Maharashtra")).toBe(true);
    expect(isJurisdictionSupported("IN", "maharashtra")).toBe(true);
    expect(isJurisdictionSupported("IN", "  Maharashtra  ")).toBe(true);
  });

  it("isJurisdictionSupported rejects an unrecognized name", () => {
    expect(isJurisdictionSupported("IN", "Narnia")).toBe(false);
  });

  it("isJurisdictionSupported rejects any name for a country with no catalog yet", () => {
    expect(isJurisdictionSupported("US", "California")).toBe(false);
    expect(isJurisdictionSupported("ZZ", "Anywhere")).toBe(false);
  });

  it("canonicalJurisdictionName normalizes casing/whitespace to the catalog's own spelling", () => {
    expect(canonicalJurisdictionName("IN", "  maharashtra ")).toBe("Maharashtra");
    expect(canonicalJurisdictionName("IN", "Narnia")).toBeUndefined();
    expect(canonicalJurisdictionName("US", "California")).toBeUndefined();
  });
});
