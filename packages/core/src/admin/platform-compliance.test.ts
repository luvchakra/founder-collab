import { describe, expect, it } from "vitest";
import {
  createCompliancePackFeatureSchema,
  createCompliancePackSchema,
  createComplianceCountrySchema,
  updateCompliancePackSchema,
  updateComplianceCountrySchema,
} from "./platform-compliance";

const validCountry = {
  countryCode: "in",
  name: "India",
  enabled: true,
  notes: "",
};

describe("createComplianceCountrySchema (PLATFORM-P0-13.1)", () => {
  it("accepts a fully populated, valid input", () => {
    expect(createComplianceCountrySchema.safeParse(validCountry).success).toBe(true);
  });

  it("uppercases the country code", () => {
    const result = createComplianceCountrySchema.safeParse(validCountry);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.countryCode).toBe("IN");
  });

  it("rejects a country code that isn't exactly 2 letters", () => {
    expect(createComplianceCountrySchema.safeParse({ ...validCountry, countryCode: "IND" }).success).toBe(false);
    expect(createComplianceCountrySchema.safeParse({ ...validCountry, countryCode: "I" }).success).toBe(false);
    expect(createComplianceCountrySchema.safeParse({ ...validCountry, countryCode: "12" }).success).toBe(false);
  });

  it("requires a non-empty name", () => {
    expect(createComplianceCountrySchema.safeParse({ ...validCountry, name: "  " }).success).toBe(false);
  });

  it("turns an empty notes string into null", () => {
    const result = createComplianceCountrySchema.safeParse(validCountry);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.notes).toBeNull();
  });

  it("rejects notes over 2000 characters", () => {
    expect(createComplianceCountrySchema.safeParse({ ...validCountry, notes: "x".repeat(2001) }).success).toBe(false);
  });

  it("coerces a truthy/falsy enabled value", () => {
    const result = createComplianceCountrySchema.safeParse({ ...validCountry, enabled: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.enabled).toBe(false);
  });
});

describe("updateComplianceCountrySchema (PLATFORM-P0-13.1)", () => {
  it("has no countryCode field at all -- a country's code is immutable after creation", () => {
    const { countryCode: _c, ...rest } = validCountry;
    const result = updateComplianceCountrySchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect("countryCode" in result.data).toBe(false);
  });
});

const validPack = {
  countryCode: "in",
  regime: "GST",
  displayName: "GST (Goods & Services Tax)",
  enabled: true,
  version: "",
  notes: "",
};

describe("createCompliancePackSchema (PLATFORM-P0-13.2)", () => {
  it("accepts a fully populated, valid input", () => {
    expect(createCompliancePackSchema.safeParse(validPack).success).toBe(true);
  });

  it("requires a non-empty regime", () => {
    expect(createCompliancePackSchema.safeParse({ ...validPack, regime: "  " }).success).toBe(false);
  });

  it("requires a non-empty display name", () => {
    expect(createCompliancePackSchema.safeParse({ ...validPack, displayName: "" }).success).toBe(false);
  });

  it("turns an empty version into null (no fabricated pack version)", () => {
    const result = createCompliancePackSchema.safeParse(validPack);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.version).toBeNull();
  });

  it("rejects a version over 100 characters", () => {
    expect(createCompliancePackSchema.safeParse({ ...validPack, version: "x".repeat(101) }).success).toBe(false);
  });
});

describe("updateCompliancePackSchema (PLATFORM-P0-13.2)", () => {
  it("has neither countryCode nor regime -- both are immutable after creation", () => {
    const { countryCode: _c, regime: _r, ...rest } = validPack;
    const result = updateCompliancePackSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect("countryCode" in result.data).toBe(false);
      expect("regime" in result.data).toBe(false);
    }
  });
});

const validFeature = {
  featureKey: "E_Invoice",
  displayName: "E-Invoice",
  enabled: true,
};

describe("createCompliancePackFeatureSchema (PLATFORM-P0-13.4)", () => {
  it("accepts a fully populated, valid input", () => {
    expect(createCompliancePackFeatureSchema.safeParse(validFeature).success).toBe(true);
  });

  it("lowercases the feature key", () => {
    const result = createCompliancePackFeatureSchema.safeParse(validFeature);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.featureKey).toBe("e_invoice");
  });

  it("rejects a feature key with spaces or hyphens", () => {
    expect(createCompliancePackFeatureSchema.safeParse({ ...validFeature, featureKey: "e invoice" }).success).toBe(false);
    expect(createCompliancePackFeatureSchema.safeParse({ ...validFeature, featureKey: "e-invoice" }).success).toBe(false);
    expect(createCompliancePackFeatureSchema.safeParse({ ...validFeature, featureKey: "" }).success).toBe(false);
  });

  it("requires a non-empty display name", () => {
    expect(createCompliancePackFeatureSchema.safeParse({ ...validFeature, displayName: "  " }).success).toBe(false);
  });
});
