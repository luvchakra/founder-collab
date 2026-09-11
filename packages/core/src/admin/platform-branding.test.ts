import { describe, expect, it } from "vitest";
import { platformBrandingInputSchema } from "./platform-branding";

const validInput = {
  platformName: "WonderArc",
  logoUrl: "https://cdn.example.com/logo.svg",
  faviconUrl: "https://cdn.example.com/favicon.ico",
  primaryColor: "#2563eb",
  secondaryColor: "#1e40af",
  accentColor: "#f97316",
  loginHeadline: "Run your whole business from one place",
  loginSupportText: "Need help? Contact support.",
  emailFromName: "WonderArc",
  footerText: "© WonderArc",
  supportEmail: "support@wonderarc.com",
  supportUrl: "https://support.wonderarc.com",
};

describe("platformBrandingInputSchema (PLATFORM-P0-03.1)", () => {
  it("accepts a fully populated, valid input", () => {
    const result = platformBrandingInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("requires a non-empty platform name", () => {
    const result = platformBrandingInputSchema.safeParse({ ...validInput, platformName: "  " });
    expect(result.success).toBe(false);
  });

  it("turns an empty optional field into null rather than an empty string", () => {
    const result = platformBrandingInputSchema.safeParse({
      ...validInput,
      logoUrl: "",
      secondaryColor: "",
      loginHeadline: "",
      supportEmail: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.logoUrl).toBeNull();
      expect(result.data.secondaryColor).toBeNull();
      expect(result.data.loginHeadline).toBeNull();
      expect(result.data.supportEmail).toBeNull();
    }
  });

  it("rejects a primary color that isn't a 6-digit hex value", () => {
    expect(platformBrandingInputSchema.safeParse({ ...validInput, primaryColor: "blue" }).success).toBe(false);
    expect(platformBrandingInputSchema.safeParse({ ...validInput, primaryColor: "#fff" }).success).toBe(false);
  });

  it("rejects an optional color that is set but malformed", () => {
    expect(platformBrandingInputSchema.safeParse({ ...validInput, accentColor: "not-a-color" }).success).toBe(false);
  });

  it("rejects a logo/favicon/support URL without an http(s) scheme", () => {
    expect(platformBrandingInputSchema.safeParse({ ...validInput, logoUrl: "cdn.example.com/logo.svg" }).success).toBe(
      false,
    );
    expect(platformBrandingInputSchema.safeParse({ ...validInput, supportUrl: "ftp://example.com" }).success).toBe(
      false,
    );
  });

  it("rejects a malformed support email", () => {
    expect(platformBrandingInputSchema.safeParse({ ...validInput, supportEmail: "not-an-email" }).success).toBe(false);
  });

  it("trims whitespace from the platform name", () => {
    const result = platformBrandingInputSchema.safeParse({ ...validInput, platformName: "  WonderArc  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.platformName).toBe("WonderArc");
  });
});
