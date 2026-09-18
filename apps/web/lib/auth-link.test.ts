/**
 * Turning a stray auth link back into a /auth/callback query. This exists because
 * Supabase silently substitutes the project's Site URL when the redirect an app asked for
 * is missing from the "Redirect URLs" allowlist — the link still arrives, just at a page
 * with nothing to consume it, which looks to a founder like the click did nothing.
 */
import { describe, expect, it } from "vitest";
import { authCallbackQuery } from "./auth-link";

/** Shaped like the real thing: Supabase's PKCE codes are UUIDs. */
const CODE = "4a4bd76b-2c3f-4f52-9c1d-1f0f7b4a2e11";

/** Parsed back out so the assertions read as intent rather than string order. */
function query(params: Parameters<typeof authCallbackQuery>[0]) {
  const built = authCallbackQuery(params);
  return built === null ? null : Object.fromEntries(new URLSearchParams(built));
}

describe("authCallbackQuery", () => {
  it("is null for an ordinary visit, so the page it guards renders normally", () => {
    expect(authCallbackQuery({})).toBeNull();
  });

  it("ignores query strings that carry no auth link", () => {
    expect(authCallbackQuery({ next: "/dashboard" } as never)).toBeNull();
  });

  it("forwards a PKCE code", () => {
    expect(query({ code: CODE })).toEqual({ code: CODE });
  });

  it("leaves an ordinary marketing ?code= alone, so the landing page still renders", () => {
    expect(authCallbackQuery({ code: "SUMMER20" })).toBeNull();
    expect(authCallbackQuery({ code: "abc123" })).toBeNull();
  });

  it("forwards a token hash with its type, which verifyOtp needs", () => {
    expect(query({ token_hash: "hash1", type: "recovery" })).toEqual({
      token_hash: "hash1",
      type: "recovery",
    });
  });

  it("ignores a token hash with no type, since it cannot be verified without one", () => {
    expect(authCallbackQuery({ token_hash: "hash1" })).toBeNull();
  });

  it("prefers the code when a link somehow carries both", () => {
    expect(query({ code: CODE, token_hash: "hash1", type: "recovery" })).toEqual({
      code: CODE,
      type: "recovery",
    });
  });

  it("falls back to the token hash when the code is not one of Supabase's", () => {
    expect(query({ code: "SUMMER20", token_hash: "hash1", type: "recovery" })).toEqual({
      token_hash: "hash1",
      type: "recovery",
    });
  });

  it("forwards a rejection so the reason reaches a page that shows it", () => {
    expect(query({ error: "access_denied", error_description: "Email link is invalid" })).toEqual({
      error: "access_denied",
      error_description: "Email link is invalid",
    });
  });

  it("forwards a description-only rejection", () => {
    expect(query({ error_description: "Email link is invalid" })).toEqual({
      error_description: "Email link is invalid",
    });
  });

  it("keeps the type on a rejection, which is what routes a dead reset link", () => {
    expect(query({ error: "access_denied", type: "recovery" })).toEqual({
      error: "access_denied",
      type: "recovery",
    });
  });

  it("carries the destination through when the link named one", () => {
    expect(query({ code: CODE, next: "/reset-password" })).toEqual({
      code: CODE,
      next: "/reset-password",
    });
  });

  it("escapes what it forwards, so a value cannot inject another parameter", () => {
    const built = authCallbackQuery({ token_hash: "h&next=/evil", type: "recovery" })!;

    expect(Object.fromEntries(new URLSearchParams(built))).toEqual({
      token_hash: "h&next=/evil",
      type: "recovery",
    });
    expect(built).toContain("token_hash=h%26next%3D%2Fevil");
  });
});
