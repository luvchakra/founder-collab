import { describe, expect, it } from "vitest";
import { isAiProviderFailure } from "./is-provider-failure";

describe("isAiProviderFailure", () => {
  it.each([
    "Your API key could not complete this request",
    "Connect an AI provider to continue",
    "The request hit a rate limit or quota cap",
    "The model gpt-5.4-pro isn't available on your plan",
    "The provider is currently unavailable",
    "Request to openai timed out",
  ])("recognizes: %s", (message) => {
    expect(isAiProviderFailure(message)).toBe(true);
  });

  it("does not flag an unrelated error", () => {
    expect(isAiProviderFailure("Prospect not found")).toBe(false);
  });

  // Regression guard for TC-DISCOVERY-012 / commit cb4dec4: a Gemini url_context
  // retrieval failure (the site blocked/redirected the fetch) must never be classified
  // as a BYOK/provider failure ("invalid API key" et al.) -- they need different UI
  // treatment (a "check the URL" message vs. a "connect a provider" CTA), and before
  // that fix the two were indistinguishable to the person hitting them.
  it("does not flag a Gemini url_context retrieval failure as a provider/API-key failure", () => {
    const message =
      "Gemini could not retrieve https://example.com (status: URL_RETRIEVAL_STATUS_UNSPECIFIED). " +
      "The site may be blocking automated access, redirecting, or returning an error -- check it " +
      "loads without a login and isn't behind a WAF/CDN challenge.";
    expect(isAiProviderFailure(message)).toBe(false);
  });
});
