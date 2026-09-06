import { describe, expect, it } from "vitest";
import { resolveModelId, type AiProvider, type AiQualityTier } from "./model-registry";

const PROVIDERS: AiProvider[] = ["openai", "anthropic", "google"];
const TIERS: AiQualityTier[] = ["fast", "balanced", "reasoning"];

describe("resolveModelId", () => {
  it("returns a non-empty model id for every provider/tier combination", () => {
    for (const provider of PROVIDERS) {
      for (const tier of TIERS) {
        expect(resolveModelId(provider, tier)).toBeTruthy();
      }
    }
  });

  it("is deterministic", () => {
    expect(resolveModelId("anthropic", "balanced")).toBe(resolveModelId("anthropic", "balanced"));
  });
});
