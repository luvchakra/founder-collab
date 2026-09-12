import { describe, expect, it } from "vitest";
import { updateAiFeaturePolicySchema } from "./platform-ai-feature-policies";

const validInput = {
  aiEnabled: true,
  allowedProviders: ["anthropic" as const, "openai" as const],
  allowedModels: "claude-sonnet-5, gpt-5.4",
  maxTokensPerRun: "8000",
  maxRunCostUsd: "0.5",
  dailyPlatformBudgetUsd: "100",
  monthlyBudgetUsd: "2500",
  reason: "Setting initial platform-wide AI ceilings ahead of rollout.",
};

describe("updateAiFeaturePolicySchema (PLATFORM-P0-09.4, config-only)", () => {
  it("accepts a fully-populated policy", () => {
    const result = updateAiFeaturePolicySchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allowedModels).toEqual(["claude-sonnet-5", "gpt-5.4"]);
      expect(result.data.maxTokensPerRun).toBe(8000);
      expect(result.data.maxRunCostUsd).toBe(0.5);
      expect(result.data.dailyPlatformBudgetUsd).toBe(100);
      expect(result.data.monthlyBudgetUsd).toBe(2500);
    }
  });

  it("accepts an entirely empty policy -- no restriction/ceiling configured yet is valid", () => {
    const result = updateAiFeaturePolicySchema.safeParse({
      aiEnabled: true,
      allowedProviders: [],
      allowedModels: "",
      maxTokensPerRun: "",
      maxRunCostUsd: "",
      dailyPlatformBudgetUsd: "",
      monthlyBudgetUsd: "",
      reason: "No ceilings configured yet.",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allowedProviders).toEqual([]);
      expect(result.data.allowedModels).toEqual([]);
      expect(result.data.maxTokensPerRun).toBeNull();
      expect(result.data.maxRunCostUsd).toBeNull();
      expect(result.data.dailyPlatformBudgetUsd).toBeNull();
      expect(result.data.monthlyBudgetUsd).toBeNull();
    }
  });

  it("dedupes and trims a comma-separated allowed-models list", () => {
    const result = updateAiFeaturePolicySchema.safeParse({
      ...validInput,
      allowedModels: " gpt-5.4 , gpt-5.4 ,claude-sonnet-5 ",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.allowedModels).toEqual(["gpt-5.4", "claude-sonnet-5"]);
  });

  it("rejects an unrecognized allowed provider", () => {
    const result = updateAiFeaturePolicySchema.safeParse({ ...validInput, allowedProviders: ["cohere"] });
    expect(result.success).toBe(false);
  });

  it("rejects a non-positive maximum tokens per run", () => {
    expect(updateAiFeaturePolicySchema.safeParse({ ...validInput, maxTokensPerRun: "0" }).success).toBe(false);
    expect(updateAiFeaturePolicySchema.safeParse({ ...validInput, maxTokensPerRun: "-5" }).success).toBe(false);
    expect(updateAiFeaturePolicySchema.safeParse({ ...validInput, maxTokensPerRun: "not-a-number" }).success).toBe(false);
  });

  it("rejects a non-positive maximum run cost", () => {
    expect(updateAiFeaturePolicySchema.safeParse({ ...validInput, maxRunCostUsd: "0" }).success).toBe(false);
    expect(updateAiFeaturePolicySchema.safeParse({ ...validInput, maxRunCostUsd: "-1" }).success).toBe(false);
  });

  it("rejects a non-positive daily platform budget", () => {
    expect(updateAiFeaturePolicySchema.safeParse({ ...validInput, dailyPlatformBudgetUsd: "0" }).success).toBe(false);
  });

  it("rejects a non-positive monthly budget", () => {
    expect(updateAiFeaturePolicySchema.safeParse({ ...validInput, monthlyBudgetUsd: "0" }).success).toBe(false);
    expect(updateAiFeaturePolicySchema.safeParse({ ...validInput, monthlyBudgetUsd: "-10" }).success).toBe(false);
  });

  it("requires a non-empty reason", () => {
    expect(updateAiFeaturePolicySchema.safeParse({ ...validInput, reason: "" }).success).toBe(false);
    expect(updateAiFeaturePolicySchema.safeParse({ ...validInput, reason: "   " }).success).toBe(false);
  });
});
