import { describe, expect, it } from "vitest";
import { platformBrandingInputSchema, toInputFromBranding, type PlatformBranding } from "./platform-branding";

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
  loginBackgroundStyle: "gradient" as const,
  loginBackgroundValue: "#0f172a,#312e81",
  loginTermsUrl: "https://wonderarc.com/terms",
  loginPrivacyUrl: "https://wonderarc.com/privacy",
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

describe("platformBrandingInputSchema login background (PLATFORM-P0-03.3)", () => {
  it("accepts a null background value regardless of style (means 'use the current default')", () => {
    const result = platformBrandingInputSchema.safeParse({ ...validInput, loginBackgroundValue: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.loginBackgroundValue).toBeNull();
  });

  it("accepts an image URL when style is image", () => {
    const result = platformBrandingInputSchema.safeParse({
      ...validInput,
      loginBackgroundStyle: "image",
      loginBackgroundValue: "https://cdn.example.com/bg.jpg",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a hex color pair when style is image", () => {
    const result = platformBrandingInputSchema.safeParse({
      ...validInput,
      loginBackgroundStyle: "image",
      loginBackgroundValue: "#0f172a,#312e81",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a single hex color when style is solid", () => {
    const result = platformBrandingInputSchema.safeParse({
      ...validInput,
      loginBackgroundStyle: "solid",
      loginBackgroundValue: "#0f172a",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a URL when style is solid", () => {
    const result = platformBrandingInputSchema.safeParse({
      ...validInput,
      loginBackgroundStyle: "solid",
      loginBackgroundValue: "https://cdn.example.com/bg.jpg",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a single hex color when style is gradient (needs two, comma-separated)", () => {
    const result = platformBrandingInputSchema.safeParse({
      ...validInput,
      loginBackgroundStyle: "gradient",
      loginBackgroundValue: "#0f172a",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown background style", () => {
    const result = platformBrandingInputSchema.safeParse({ ...validInput, loginBackgroundStyle: "video" });
    expect(result.success).toBe(false);
  });

  it("rejects a terms/privacy URL without an http(s) scheme", () => {
    expect(
      platformBrandingInputSchema.safeParse({ ...validInput, loginTermsUrl: "wonderarc.com/terms" }).success,
    ).toBe(false);
  });

  it("turns an empty terms/privacy URL into null", () => {
    const result = platformBrandingInputSchema.safeParse({ ...validInput, loginTermsUrl: "", loginPrivacyUrl: "" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.loginTermsUrl).toBeNull();
      expect(result.data.loginPrivacyUrl).toBeNull();
    }
  });
});

describe("toInputFromBranding (PLATFORM-P0-03.5)", () => {
  const liveBranding: PlatformBranding = {
    platformName: "WonderArc",
    logoUrl: "https://cdn.example.com/logo.svg",
    faviconUrl: null,
    primaryColor: "#2563eb",
    secondaryColor: null,
    accentColor: "#f97316",
    loginHeadline: "Run your whole business from one place",
    loginSupportText: null,
    emailFromName: null,
    footerText: "© WonderArc",
    supportEmail: "support@wonderarc.com",
    supportUrl: null,
    loginBackgroundStyle: "gradient",
    loginBackgroundValue: "#0f172a,#312e81",
    loginTermsUrl: null,
    loginPrivacyUrl: null,
    updatedAt: "2026-09-11T00:00:00.000Z",
    updatedBy: "11111111-1111-1111-1111-111111111111",
  };

  it("carries required fields through unchanged", () => {
    const input = toInputFromBranding(liveBranding);
    expect(input.platformName).toBe("WonderArc");
    expect(input.primaryColor).toBe("#2563eb");
    expect(input.loginBackgroundStyle).toBe("gradient");
    expect(input.loginBackgroundValue).toBe("#0f172a,#312e81");
  });

  it("turns every null optional field into an empty string, not the literal string 'null'", () => {
    const input = toInputFromBranding(liveBranding);
    expect(input.faviconUrl).toBe("");
    expect(input.secondaryColor).toBe("");
    expect(input.loginSupportText).toBe("");
    expect(input.emailFromName).toBe("");
    expect(input.supportUrl).toBe("");
    expect(input.loginTermsUrl).toBe("");
    expect(input.loginPrivacyUrl).toBe("");
  });

  it("round-trips cleanly back through platformBrandingInputSchema (the Edit form's fallback pre-fill is always valid input)", () => {
    const input = toInputFromBranding(liveBranding);
    const result = platformBrandingInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.faviconUrl).toBeNull();
      expect(result.data.accentColor).toBe("#f97316");
      expect(result.data.footerText).toBe("© WonderArc");
    }
  });
});
