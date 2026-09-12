import { describe, expect, it } from "vitest";
import { EXEMPTION_CERTIFICATE_TYPE_CATALOG, getExemptionCertificateType, isExemptionCertificateTypeSupported } from "./types";

describe("EXEMPTION_CERTIFICATE_TYPE_CATALOG", () => {
  it("has exactly the six certificate types this story defines, no duplicates", () => {
    const codes = EXEMPTION_CERTIFICATE_TYPE_CATALOG.map((c) => c.code);
    expect(codes).toEqual(["resale", "manufacturing", "agricultural", "government", "exempt_organization", "other"]);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("every entry has a name and description", () => {
    for (const entry of EXEMPTION_CERTIFICATE_TYPE_CATALOG) {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });
});

describe("getExemptionCertificateType / isExemptionCertificateTypeSupported", () => {
  it("finds a known type", () => {
    expect(getExemptionCertificateType("resale")?.name).toBe("Resale certificate");
    expect(isExemptionCertificateTypeSupported("resale")).toBe(true);
  });

  it("misses an unknown type", () => {
    expect(getExemptionCertificateType("diplomatic")).toBeUndefined();
    expect(isExemptionCertificateTypeSupported("diplomatic")).toBe(false);
  });
});
