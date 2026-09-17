import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PUBLIC_LOGIN_BRANDING,
  getPublicLoginBranding,
  platformBrandingInputSchema,
  toInputFromBranding,
  type PlatformBranding,
} from "./platform-branding";

const validInput = {
  platformName: "WonderArk",
  logoUrl: "https://cdn.example.com/logo.svg",
  faviconUrl: "https://cdn.example.com/favicon.ico",
  primaryColor: "#2563eb",
  secondaryColor: "#1e40af",
  accentColor: "#f97316",
  loginHeadline: "Run your whole business from one place",
  loginSupportText: "Need help? Contact support.",
  emailFromName: "WonderArk",
  footerText: "© WonderArk",
  supportEmail: "support@wonderark.com",
  supportUrl: "https://support.wonderark.com",
  loginBackgroundStyle: "gradient" as const,
  loginBackgroundValue: "#0f172a,#312e81",
  loginTermsUrl: "https://wonderark.com/terms",
  loginPrivacyUrl: "https://wonderark.com/privacy",
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
    const result = platformBrandingInputSchema.safeParse({ ...validInput, platformName: "  WonderArk  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.platformName).toBe("WonderArk");
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
      platformBrandingInputSchema.safeParse({ ...validInput, loginTermsUrl: "wonderark.com/terms" }).success,
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
    platformName: "WonderArk",
    logoUrl: "https://cdn.example.com/logo.svg",
    faviconUrl: null,
    primaryColor: "#2563eb",
    secondaryColor: null,
    accentColor: "#f97316",
    loginHeadline: "Run your whole business from one place",
    loginSupportText: null,
    emailFromName: null,
    footerText: "© WonderArk",
    supportEmail: "support@wonderark.com",
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
    expect(input.platformName).toBe("WonderArk");
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
      expect(result.data.footerText).toBe("© WonderArk");
    }
  });
});

/**
 * Regression guard for the outage that made every `(auth)` page 500 -- `/login`,
 * `/signup`, `/forgot-password` and `/reset-password` all render through a shared layout
 * that calls getPublicLoginBranding(), so anything this function throws locks every user
 * out of the product entirely, including the ones trying to sign in and fix it.
 *
 * These run without a database on purpose: the failure mode is specifically "the
 * environment isn't configured", which no DB-backed test could reproduce.
 */
describe("getPublicLoginBranding (auth pages must survive an unreadable branding row)", () => {
  const KEY = "SUPABASE_SERVICE_ROLE_KEY";
  const original = process.env[KEY];

  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
    vi.restoreAllMocks();
  });

  it("falls back to defaults instead of throwing when the service-role key is missing", async () => {
    delete process.env[KEY];
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(getPublicLoginBranding()).resolves.toEqual(DEFAULT_PUBLIC_LOGIN_BRANDING);
  });

  it("says so in the logs rather than failing silently", async () => {
    delete process.env[KEY];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await getPublicLoginBranding();

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain(KEY);
  });

  it("defaults are a shape the login page can actually render (a name, and nothing else required)", () => {
    expect(DEFAULT_PUBLIC_LOGIN_BRANDING.platformName.trim()).not.toBe("");
    // Every other field is optional copy -- the page renders each only when set, so null
    // across the board is exactly the "unbranded platform" state it already handles.
    expect(DEFAULT_PUBLIC_LOGIN_BRANDING.loginBackgroundStyle).toBe("gradient");
    expect(DEFAULT_PUBLIC_LOGIN_BRANDING.logoUrl).toBeNull();
    expect(DEFAULT_PUBLIC_LOGIN_BRANDING.loginHeadline).toBeNull();
    expect(DEFAULT_PUBLIC_LOGIN_BRANDING.loginBackgroundValue).toBeNull();
    expect(DEFAULT_PUBLIC_LOGIN_BRANDING.loginTermsUrl).toBeNull();
    expect(DEFAULT_PUBLIC_LOGIN_BRANDING.loginPrivacyUrl).toBeNull();
  });
});
