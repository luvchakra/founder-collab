import { describe, expect, it } from "vitest";
import { updateAiProviderRoutingSchema } from "./platform-ai-provider-routing";

const validInput = {
  defaultProvider: "anthropic" as const,
  defaultModel: "claude-sonnet-5",
  moduleOverrides: [{ moduleKey: "discovery", provider: "google" as const }],
  fallbackProvider: "openai" as const,
  reason: "Preferring Gemini for Discovery ahead of its own rollout.",
};

describe("updateAiProviderRoutingSchema (PLATFORM-P0-09.3, config-only)", () => {
  it("accepts a fully-populated policy", () => {
    const result = updateAiProviderRoutingSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("accepts an entirely empty policy -- nothing set yet is a valid, honest state", () => {
    const result = updateAiProviderRoutingSchema.safeParse({
      defaultProvider: "",
      defaultModel: "",
      moduleOverrides: [],
      fallbackProvider: "",
      reason: "Clearing the routing policy for now.",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultProvider).toBeNull();
      expect(result.data.defaultModel).toBeNull();
      expect(result.data.fallbackProvider).toBeNull();
      expect(result.data.moduleOverrides).toEqual([]);
    }
  });

  it("rejects an unrecognized default provider", () => {
    const result = updateAiProviderRoutingSchema.safeParse({ ...validInput, defaultProvider: "cohere" });
    expect(result.success).toBe(false);
  });

  it("rejects an unrecognized fallback provider", () => {
    const result = updateAiProviderRoutingSchema.safeParse({ ...validInput, fallbackProvider: "cohere" });
    expect(result.success).toBe(false);
  });

  it("rejects an unrecognized provider inside a module override", () => {
    const result = updateAiProviderRoutingSchema.safeParse({
      ...validInput,
      moduleOverrides: [{ moduleKey: "discovery", provider: "cohere" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate overrides for the same module", () => {
    const result = updateAiProviderRoutingSchema.safeParse({
      ...validInput,
      moduleOverrides: [
        { moduleKey: "discovery", provider: "google" },
        { moduleKey: "discovery", provider: "openai" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts overrides for multiple distinct modules", () => {
    const result = updateAiProviderRoutingSchema.safeParse({
      ...validInput,
      moduleOverrides: [
        { moduleKey: "discovery", provider: "google" },
        { moduleKey: "crm", provider: "openai" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("requires a non-empty reason", () => {
    expect(updateAiProviderRoutingSchema.safeParse({ ...validInput, reason: "" }).success).toBe(false);
    expect(updateAiProviderRoutingSchema.safeParse({ ...validInput, reason: "   " }).success).toBe(false);
  });
});
