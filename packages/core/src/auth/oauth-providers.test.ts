import { afterEach, describe, expect, it, vi } from "vitest";
import { readableOAuthError } from "./oauth-providers";

describe("readableOAuthError", () => {
  it("rewrites Supabase's unenabled-provider message into something actionable", () => {
    const rewritten = readableOAuthError("Unsupported provider: provider is not enabled", "google");
    expect(rewritten).toContain("Google sign-in isn't switched on");
    expect(rewritten).toContain("email and password");
    // Names the exact place an administrator has to go, rather than "contact support".
    expect(rewritten).toContain("Authentication");
  });

  it("matches the shorter wording Supabase also uses", () => {
    expect(readableOAuthError("Unsupported provider", "google")).toContain("isn't switched on");
  });

  // Anything else is a real failure with its own cause -- rewriting it would hide a
  // network error or a bad redirect URL behind a configuration message that isn't true.
  it("passes an unrelated failure through unchanged", () => {
    const message = "redirect_uri_mismatch";
    expect(readableOAuthError(message, "google")).toBe(message);
  });
});

describe("Microsoft and LinkedIn", () => {
  it("name the provider and the exact Supabase setting to switch on", () => {
    expect(readableOAuthError("provider is not enabled", "azure")).toContain("Microsoft sign-in isn't switched on");
    expect(readableOAuthError("provider is not enabled", "azure")).toContain("Azure (Microsoft)");
    expect(readableOAuthError("provider is not enabled", "linkedin_oidc")).toContain("LinkedIn (OIDC)");
  });
});

describe("isOAuthProvider", () => {
  it("accepts only the supported providers", async () => {
    const { isOAuthProvider } = await import("./oauth-providers");
    expect(["google", "azure", "linkedin_oidc"].every(isOAuthProvider)).toBe(true);
    expect(isOAuthProvider("github")).toBe(false);
    expect(isOAuthProvider("linkedin")).toBe(false);
    expect(isOAuthProvider(undefined)).toBe(false);
  });
});

describe("getEnabledOAuthProviders", () => {
  async function withSettings(response: () => Promise<Response>) {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
    vi.stubGlobal("fetch", vi.fn(response));
    vi.resetModules();
    const { getEnabledOAuthProviders } = await import("./oauth-providers");
    return getEnabledOAuthProviders();
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reports each provider exactly as the project's settings say", async () => {
    const result = await withSettings(async () =>
      Response.json({ external: { google: true, azure: false, linkedin_oidc: true, linkedin: false, email: true } }),
    );
    expect(result).toEqual({ google: true, azure: false, linkedin_oidc: true });
  });

  it("hides every button when the project has them all switched off", async () => {
    const result = await withSettings(async () => Response.json({ external: { google: false, azure: false, linkedin_oidc: false } }));
    expect(result).toEqual({ google: false, azure: false, linkedin_oidc: false });
  });

  it("fails open when the project can't be reached", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await withSettings(async () => {
      throw new Error("offline");
    });
    expect(result).toEqual({ google: true, azure: true, linkedin_oidc: true });
  });
});
