import { describe, expect, it } from "vitest";
import { US_STATES, getUsState, hasStateSalesTax, isUsState, resolveUsStateCode } from "./us-states";

describe("US_STATES catalog", () => {
  it("has exactly 51 entries (50 states + DC) with no duplicate codes", () => {
    expect(US_STATES.length).toBe(51);
    expect(new Set(US_STATES.map((s) => s.code)).size).toBe(51);
  });

  it("the five NOMAD states have no state sales tax", () => {
    for (const code of ["AK", "DE", "MT", "NH", "OR"]) {
      expect(hasStateSalesTax(code)).toBe(false);
    }
  });

  it("Alaska is flagged as having local sales tax despite no state tax", () => {
    expect(getUsState("AK")?.hasLocalSalesTaxWithNoStateTax).toBe(true);
  });

  it("the other four NOMAD states have no local-tax flag set", () => {
    for (const code of ["DE", "MT", "NH", "OR"]) {
      expect(getUsState(code)?.hasLocalSalesTaxWithNoStateTax).toBeUndefined();
    }
  });

  it("every other state has a state sales tax", () => {
    for (const code of ["CA", "TX", "NY", "FL", "DC"]) {
      expect(hasStateSalesTax(code)).toBe(true);
    }
  });

  it("isUsState/getUsState correctly reject an unknown code", () => {
    expect(isUsState("ZZ")).toBe(false);
    expect(getUsState("ZZ")).toBeUndefined();
    expect(hasStateSalesTax("ZZ")).toBe(false);
  });
});

describe("resolveUsStateCode", () => {
  it("passes through an already-correct code, case-insensitively", () => {
    expect(resolveUsStateCode("CA")).toBe("CA");
    expect(resolveUsStateCode("ca")).toBe("CA");
  });

  it("resolves a full state name in any casing", () => {
    expect(resolveUsStateCode("California")).toBe("CA");
    expect(resolveUsStateCode("new york")).toBe("NY");
  });

  it("tolerates surrounding whitespace", () => {
    expect(resolveUsStateCode("  Texas  ")).toBe("TX");
  });

  it("returns null for an unrecognized value, an empty string, and null/undefined", () => {
    expect(resolveUsStateCode("Ontario")).toBeNull();
    expect(resolveUsStateCode("")).toBeNull();
    expect(resolveUsStateCode(null)).toBeNull();
    expect(resolveUsStateCode(undefined)).toBeNull();
  });
});
