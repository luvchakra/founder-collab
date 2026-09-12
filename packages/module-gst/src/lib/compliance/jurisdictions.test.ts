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

  it("has 13 Canadian provinces/territories (COMPLY-P1-03.1), all at province level, keyed by two-letter code", () => {
    const jurisdictions = getJurisdictions("CA"); // Canada, not to be confused with the "CA" US state code above
    expect(jurisdictions.length).toBe(13);
    expect(jurisdictions.every((j) => j.level === "province")).toBe(true);
    expect(jurisdictions.map((j) => j.name)).toContain("ON");
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

  it("isJurisdictionSupported matches a Canadian province name OR its own two-letter code case-insensitively", () => {
    expect(isJurisdictionSupported("CA", "ON")).toBe(true);
    expect(isJurisdictionSupported("CA", "on")).toBe(true);
    expect(isJurisdictionSupported("CA", "Ontario")).toBe(false); // the full name, not the catalog's own two-letter code
  });

  it("isJurisdictionSupported rejects any name for a country with no catalog at all", () => {
    expect(isJurisdictionSupported("ZZ", "Anywhere")).toBe(false);
  });

  it("canonicalJurisdictionName normalizes casing/whitespace to the catalog's own spelling", () => {
    expect(canonicalJurisdictionName("IN", "  maharashtra ")).toBe("Maharashtra");
    expect(canonicalJurisdictionName("IN", "Narnia")).toBeUndefined();
    expect(canonicalJurisdictionName("US", "  ca ")).toBe("CA");
    expect(canonicalJurisdictionName("US", "California")).toBeUndefined();
  });
});
