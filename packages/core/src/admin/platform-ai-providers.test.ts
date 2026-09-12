import { describe, expect, it } from "vitest";
import { removeAiProviderKeySchema, setAiProviderKeySchema, updateAiProviderConfigSchema } from "./platform-ai-providers";

const validConfig = {
  provider: "openai" as const,
  enabled: true,
  models: "gpt-5.4, gpt-5.4-mini",
  defaultModel: "gpt-5.4",
  fallbackModel: "gpt-5.4-mini",
  rateLimits: "",
  costControls: "",
  reason: "Registering OpenAI ahead of next week's rollout.",
};

describe("updateAiProviderConfigSchema (PLATFORM-P0-09.1/09.2)", () => {
  it("accepts a valid config", () => {
    const result = updateAiProviderConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it("dedupes and trims a comma-separated model list", () => {
    const result = updateAiProviderConfigSchema.safeParse({
      ...validConfig,
      models: " gpt-5.4 , gpt-5.4-mini, gpt-5.4 ,gpt-5.4-mini ",
      defaultModel: "gpt-5.4",
      fallbackModel: "gpt-5.4-mini",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.models).toEqual(["gpt-5.4", "gpt-5.4-mini"]);
  });

  it("treats an empty model list as valid (no models configured yet)", () => {
    const result = updateAiProviderConfigSchema.safeParse({
      ...validConfig,
      models: "",
      defaultModel: "",
      fallbackModel: "",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.models).toEqual([]);
  });

  it("rejects a default model that isn't in the configured model list", () => {
    const result = updateAiProviderConfigSchema.safeParse({ ...validConfig, defaultModel: "gpt-3" });
    expect(result.success).toBe(false);
  });

  it("rejects a fallback model that isn't in the configured model list", () => {
    const result = updateAiProviderConfigSchema.safeParse({ ...validConfig, fallbackModel: "gpt-3" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid JSON object for rate limits and cost controls", () => {
    const result = updateAiProviderConfigSchema.safeParse({
      ...validConfig,
      rateLimits: '{"requestsPerMinute": 60}',
      costControls: '{"maxCostPerRunUsd": 0.5}',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rateLimits).toEqual({ requestsPerMinute: 60 });
      expect(result.data.costControls).toEqual({ maxCostPerRunUsd: 0.5 });
    }
  });

  it("normalizes an empty rate-limits/cost-controls field to {}", () => {
    const result = updateAiProviderConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rateLimits).toEqual({});
      expect(result.data.costControls).toEqual({});
    }
  });

  it("rejects invalid JSON for rate limits", () => {
    const result = updateAiProviderConfigSchema.safeParse({ ...validConfig, rateLimits: "{not json" });
    expect(result.success).toBe(false);
  });

  it("rejects a JSON array or primitive for cost controls (must be an object)", () => {
    expect(updateAiProviderConfigSchema.safeParse({ ...validConfig, costControls: "[1,2,3]" }).success).toBe(false);
    expect(updateAiProviderConfigSchema.safeParse({ ...validConfig, costControls: "5" }).success).toBe(false);
    expect(updateAiProviderConfigSchema.safeParse({ ...validConfig, costControls: "null" }).success).toBe(false);
  });

  it("rejects an unknown provider", () => {
    const result = updateAiProviderConfigSchema.safeParse({ ...validConfig, provider: "cohere" });
    expect(result.success).toBe(false);
  });

  it("requires a non-empty reason", () => {
    expect(updateAiProviderConfigSchema.safeParse({ ...validConfig, reason: "" }).success).toBe(false);
    expect(updateAiProviderConfigSchema.safeParse({ ...validConfig, reason: "   " }).success).toBe(false);
  });
});

describe("setAiProviderKeySchema (PLATFORM-P0-09.2)", () => {
  it("accepts a valid key + reason", () => {
    const result = setAiProviderKeySchema.safeParse({
      provider: "anthropic",
      apiKey: "sk-ant-real-looking-key",
      reason: "Connecting the platform's own Anthropic credential.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty or whitespace-only API key", () => {
    expect(
      setAiProviderKeySchema.safeParse({ provider: "openai", apiKey: "", reason: "test" }).success,
    ).toBe(false);
    expect(
      setAiProviderKeySchema.safeParse({ provider: "openai", apiKey: "   ", reason: "test" }).success,
    ).toBe(false);
  });

  it("requires a non-empty reason", () => {
    const result = setAiProviderKeySchema.safeParse({ provider: "openai", apiKey: "sk-real", reason: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown provider", () => {
    const result = setAiProviderKeySchema.safeParse({ provider: "mistral", apiKey: "sk-real", reason: "test" });
    expect(result.success).toBe(false);
  });
});

describe("removeAiProviderKeySchema (PLATFORM-P0-09.2)", () => {
  it("requires a non-empty reason", () => {
    expect(removeAiProviderKeySchema.safeParse({ provider: "openai", reason: "" }).success).toBe(false);
    expect(removeAiProviderKeySchema.safeParse({ provider: "openai", reason: "no longer needed" }).success).toBe(
      true,
    );
  });

  it("rejects an unknown provider", () => {
    expect(removeAiProviderKeySchema.safeParse({ provider: "mistral", reason: "test" }).success).toBe(false);
  });
});
