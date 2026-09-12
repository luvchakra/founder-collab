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

  it("has 51 US states/DC (COMPLY-P1-02.1), all at state level, keyed by two-letter code", () => {
    const jurisdictions = getJurisdictions("US");
    expect(jurisdictions.length).toBe(51);
    expect(jurisdictions.every((j) => j.level === "state")).toBe(true);
    expect(jurisdictions.map((j) => j.name)).toContain("CA");
  });

  it("returns no jurisdictions for a planned-but-unimplemented country", () => {
    expect(getJurisdictions("CA")).toEqual([]); // Canada, not to be confused with the "CA" US state code above
  });

  it("returns no jurisdictions for an unknown country code", () => {
    expect(getJurisdictions("ZZ")).toEqual([]);
  });

  it("isJurisdictionSupported matches an Indian state case-insensitively", () => {
    expect(isJurisdictionSupported("IN", "Maharashtra")).toBe(true);
    expect(isJurisdictionSupported("IN", "maharashtra")).toBe(true);
    expect(isJurisdictionSupported("IN", "  Maharashtra  ")).toBe(true);
  });

  it("isJurisdictionSupported matches a US state code case-insensitively", () => {
    expect(isJurisdictionSupported("US", "CA")).toBe(true);
    expect(isJurisdictionSupported("US", "ca")).toBe(true);
    expect(isJurisdictionSupported("US", "California")).toBe(false); // the full name, not the catalog's own two-letter code
  });

  it("isJurisdictionSupported rejects an unrecognized name", () => {
    expect(isJurisdictionSupported("IN", "Narnia")).toBe(false);
  });

  it("isJurisdictionSupported rejects any name for a country with no catalog yet", () => {
    expect(isJurisdictionSupported("CA", "Ontario")).toBe(false);
    expect(isJurisdictionSupported("ZZ", "Anywhere")).toBe(false);
  });

  it("canonicalJurisdictionName normalizes casing/whitespace to the catalog's own spelling", () => {
    expect(canonicalJurisdictionName("IN", "  maharashtra ")).toBe("Maharashtra");
    expect(canonicalJurisdictionName("IN", "Narnia")).toBeUndefined();
    expect(canonicalJurisdictionName("US", "  ca ")).toBe("CA");
    expect(canonicalJurisdictionName("US", "California")).toBeUndefined();
  });
});
