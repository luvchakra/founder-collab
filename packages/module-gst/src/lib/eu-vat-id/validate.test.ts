import { describe, expect, it } from "vitest";
import { validateEuVatId } from "./validate";

describe("validateEuVatId", () => {
  it("reports countrySupported: false for a country this build doesn't validate yet", () => {
    const result = validateEuVatId("NL123456789B01");
    expect(result.countrySupported).toBe(false);
    expect(result.valid).toBe(false);
  });

  it("normalizes whitespace and casing before matching the country prefix", () => {
    expect(validateEuVatId("de 136695976").valid).toBe(true);
  });

  describe("Germany (DE + 9 digits, ISO 7064 MOD 11,10 check digit)", () => {
    it("accepts a valid number (a well-known public DE VAT test number)", () => {
      expect(validateEuVatId("DE136695976")).toMatchObject({ valid: true, countrySupported: true });
    });

    it("rejects a wrong length or non-numeric body", () => {
      expect(validateEuVatId("DE13669597").valid).toBe(false); // 8 digits
      expect(validateEuVatId("DE1366959766").valid).toBe(false); // 10 digits
      expect(validateEuVatId("DE13669597A").valid).toBe(false);
    });

    it("rejects a mutated check digit", () => {
      expect(validateEuVatId("DE136695970").valid).toBe(false);
    });
  });

  describe("France (FR + 2-char key + 9-digit SIREN, key = (12 + 3*(SIREN mod 97)) mod 97)", () => {
    it("accepts the documented worked example (SIREN 404833048 -> key 83)", () => {
      expect(validateEuVatId("FR83404833048")).toMatchObject({ valid: true, countrySupported: true });
    });

    it("rejects a wrong numeric key", () => {
      expect(validateEuVatId("FR82404833048").valid).toBe(false);
    });

    it("accepts a letter-containing key as format-valid (checksum not modeled -- see docstring)", () => {
      expect(validateEuVatId("FRK7404833048").valid).toBe(true);
    });

    it("rejects a malformed body", () => {
      expect(validateEuVatId("FR8340483304").valid).toBe(false); // 8-digit SIREN
    });
  });

  describe("Belgium (BE + 10 digits, first digit 0 or 1, last two = 97 - (first eight mod 97))", () => {
    it("accepts a valid number (a well-known public BE VAT test number)", () => {
      expect(validateEuVatId("BE0403170701")).toMatchObject({ valid: true, countrySupported: true });
    });

    it("rejects a first digit other than 0 or 1", () => {
      expect(validateEuVatId("BE2403170701").valid).toBe(false);
    });

    it("rejects a mutated checksum", () => {
      expect(validateEuVatId("BE0403170702").valid).toBe(false);
    });

    it("rejects a wrong length", () => {
      expect(validateEuVatId("BE040317070").valid).toBe(false);
    });
  });

  describe("Poland (PL + 10-digit NIP, weighted mod-11 check digit)", () => {
    it("accepts the documented worked example (NIP 2073786728)", () => {
      expect(validateEuVatId("PL2073786728")).toMatchObject({ valid: true, countrySupported: true });
    });

    it("rejects a mutated check digit", () => {
      expect(validateEuVatId("PL2073786729").valid).toBe(false);
    });

    it("rejects a wrong length", () => {
      expect(validateEuVatId("PL207378672").valid).toBe(false);
    });
  });

  describe("Italy (IT + 11-digit Partita IVA, Luhn-style check digit)", () => {
    it("accepts a self-computed valid number", () => {
      expect(validateEuVatId("IT00123456709")).toMatchObject({ valid: true, countrySupported: true });
    });

    it("rejects a mutated check digit", () => {
      expect(validateEuVatId("IT00123456701").valid).toBe(false);
    });

    it("rejects a wrong length", () => {
      expect(validateEuVatId("IT0012345670").valid).toBe(false);
    });
  });
});
