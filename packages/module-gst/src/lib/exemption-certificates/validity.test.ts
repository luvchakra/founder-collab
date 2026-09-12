import { describe, expect, it } from "vitest";
import { exemptionCertificateCoversState, isExemptionCertificateValid } from "./validity";

describe("isExemptionCertificateValid", () => {
  it("a revoked certificate is never valid, regardless of dates", () => {
    const result = isExemptionCertificateValid({ status: "revoked", issuedDate: "2020-01-01", expiresAt: null }, "2026-01-01");
    expect(result).toMatchObject({ valid: false });
    expect(result.reason).toMatch(/revoked/i);
  });

  it("a certificate issued in the future is not yet valid", () => {
    const result = isExemptionCertificateValid({ status: "active", issuedDate: "2027-01-01", expiresAt: null }, "2026-01-01");
    expect(result).toMatchObject({ valid: false });
    expect(result.reason).toMatch(/future/i);
  });

  it("a certificate past its own expiry date is expired", () => {
    const result = isExemptionCertificateValid({ status: "active", issuedDate: "2020-01-01", expiresAt: "2025-01-01" }, "2026-01-01");
    expect(result).toMatchObject({ valid: false });
    expect(result.reason).toMatch(/expired/i);
  });

  it("exactly on the expiry date is still valid (expiresAt is inclusive -- 'valid through' this date)", () => {
    expect(isExemptionCertificateValid({ status: "active", issuedDate: "2020-01-01", expiresAt: "2026-01-01" }, "2026-01-01").valid).toBe(true);
  });

  it("the day after expiry is expired", () => {
    expect(isExemptionCertificateValid({ status: "active", issuedDate: "2020-01-01", expiresAt: "2026-01-01" }, "2026-01-02").valid).toBe(false);
  });

  it("no expiry at all (null) is valid indefinitely once issued", () => {
    expect(isExemptionCertificateValid({ status: "active", issuedDate: "2020-01-01", expiresAt: null }, "2099-01-01").valid).toBe(true);
  });

  it("issued exactly as-of today is valid", () => {
    expect(isExemptionCertificateValid({ status: "active", issuedDate: "2026-01-01", expiresAt: null }, "2026-01-01").valid).toBe(true);
  });
});

describe("exemptionCertificateCoversState", () => {
  it("a null jurisdiction covers every state", () => {
    expect(exemptionCertificateCoversState({ jurisdiction: null }, "CA")).toBe(true);
    expect(exemptionCertificateCoversState({ jurisdiction: null }, "TX")).toBe(true);
  });

  it("a specific jurisdiction covers only itself", () => {
    expect(exemptionCertificateCoversState({ jurisdiction: "CA" }, "CA")).toBe(true);
    expect(exemptionCertificateCoversState({ jurisdiction: "CA" }, "TX")).toBe(false);
  });
});
