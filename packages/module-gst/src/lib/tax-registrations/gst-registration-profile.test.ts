import { describe, expect, it } from "vitest";
import {
  buildGstRegistrationMetadata,
  isGstRegistrationType,
  isGstReturnFrequency,
  parseGstRegistrationProfile,
} from "./gst-registration-profile";

describe("parseGstRegistrationProfile", () => {
  it("defaults every field for a registration with no profile metadata yet", () => {
    expect(parseGstRegistrationProfile({})).toEqual({
      registrationType: "regular",
      returnFrequency: "monthly",
      eInvoiceEligible: false,
    });
  });

  it("reads a fully-populated profile", () => {
    expect(
      parseGstRegistrationProfile({
        registration_type: "composition",
        return_frequency: "quarterly",
        e_invoice_eligible: true,
      }),
    ).toEqual({
      registrationType: "composition",
      returnFrequency: "quarterly",
      eInvoiceEligible: true,
    });
  });

  it("falls back to the default for an invalid/unrecognized value rather than throwing", () => {
    expect(
      parseGstRegistrationProfile({
        registration_type: "unregistered", // valid on the OLD single-value form, not here
        return_frequency: "yearly",
        e_invoice_eligible: "yes",
      }),
    ).toEqual({
      registrationType: "regular",
      returnFrequency: "monthly",
      eInvoiceEligible: false,
    });
  });
});

describe("buildGstRegistrationMetadata", () => {
  it("merges the three profile keys onto existing metadata without dropping other keys", () => {
    const existing = { some_future_key: "keep-me" };
    const result = buildGstRegistrationMetadata(existing, {
      registrationType: "composition",
      returnFrequency: "quarterly",
      eInvoiceEligible: true,
    });
    expect(result).toEqual({
      some_future_key: "keep-me",
      registration_type: "composition",
      return_frequency: "quarterly",
      e_invoice_eligible: true,
    });
  });
});

describe("type guards", () => {
  it("isGstRegistrationType accepts only regular/composition", () => {
    expect(isGstRegistrationType("regular")).toBe(true);
    expect(isGstRegistrationType("composition")).toBe(true);
    expect(isGstRegistrationType("unregistered")).toBe(false);
  });

  it("isGstReturnFrequency accepts only monthly/quarterly", () => {
    expect(isGstReturnFrequency("monthly")).toBe(true);
    expect(isGstReturnFrequency("quarterly")).toBe(true);
    expect(isGstReturnFrequency("yearly")).toBe(false);
  });
});
