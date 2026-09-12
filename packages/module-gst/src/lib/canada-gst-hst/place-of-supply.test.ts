import { describe, expect, it } from "vitest";
import { determineCaPlaceOfSupply } from "./place-of-supply";

describe("determineCaPlaceOfSupply", () => {
  it("a recognized Canadian province is domestic", () => {
    expect(determineCaPlaceOfSupply("ON", "Canada")).toEqual({ province: "ON", treatment: "domestic" });
  });

  it("recognizes 'CA' as an alias for Canada, case-insensitively", () => {
    expect(determineCaPlaceOfSupply("BC", "ca")).toEqual({ province: "BC", treatment: "domestic" });
  });

  it("a clearly non-Canadian country is an export, regardless of the province field", () => {
    expect(determineCaPlaceOfSupply("ON", "United States")).toEqual({ province: null, treatment: "export" });
  });

  it("an unset country still falls through to the province (does not default to export)", () => {
    expect(determineCaPlaceOfSupply("ON", null)).toEqual({ province: "ON", treatment: "domestic" });
  });

  it("an unrecognized province code with an unset country is unknown", () => {
    expect(determineCaPlaceOfSupply("ZZ", null)).toEqual({ province: null, treatment: "unknown" });
  });

  it("a null province with an unset country is unknown", () => {
    expect(determineCaPlaceOfSupply(null, null)).toEqual({ province: null, treatment: "unknown" });
  });

  it("a null province with Canada as the country is still unknown (never guesses a default province)", () => {
    expect(determineCaPlaceOfSupply(null, "Canada")).toEqual({ province: null, treatment: "unknown" });
  });
});
