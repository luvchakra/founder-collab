import { describe, expect, it } from "vitest";
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
