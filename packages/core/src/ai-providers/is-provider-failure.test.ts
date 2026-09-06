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
});
