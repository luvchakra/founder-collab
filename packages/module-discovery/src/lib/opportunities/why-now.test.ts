import { describe, expect, it } from "vitest";
import { computeWhyNow } from "./why-now";
import type { SignalCorrelation } from "../signals/types";

const NOW = new Date("2026-09-11T00:00:00Z");

function correlation(overrides: Partial<SignalCorrelation>): SignalCorrelation {
  return {
    id: "corr-1",
    workspace_id: "ws-1",
    prospect_id: "prospect-1",
    signal_ids: ["sig-1", "sig-2"],
    rationale: "New CISO + 12 IAM/security openings",
    confidence: "medium",
    earliest_signal_at: "2026-08-01T00:00:00Z",
    latest_signal_at: "2026-09-10T00:00:00Z",
    created_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

describe("computeWhyNow", () => {
  it("returns no false precision when there is no correlation to work from", () => {
    const result = computeWhyNow(null, NOW);
    expect(result.summary).toBeNull();
    expect(result.timingStrength).toBeNull();
    expect(result.confidence).toBe("low");
    expect(result.timingScore).toBeNull();
  });

  it("rates a signal observed today or within a week as high timing strength", () => {
    const result = computeWhyNow(correlation({ latest_signal_at: "2026-09-10T00:00:00Z" }), NOW);
    expect(result.timingStrength).toBe("high");
    expect(result.timingScore).toBe(90);
    expect(result.summary).toBe("New CISO + 12 IAM/security openings (most recently observed 1 day ago)");
  });

  it("rates a signal observed within a month as medium timing strength", () => {
    const result = computeWhyNow(correlation({ latest_signal_at: "2026-08-20T00:00:00Z" }), NOW);
    expect(result.timingStrength).toBe("medium");
    expect(result.timingScore).toBe(60);
  });

  it("rates a signal older than a month as low timing strength", () => {
    const result = computeWhyNow(correlation({ latest_signal_at: "2026-06-01T00:00:00Z" }), NOW);
    expect(result.timingStrength).toBe("low");
    expect(result.timingScore).toBe(30);
  });

  it("takes the weaker of timing strength and correlation confidence", () => {
    // Fresh (high timing) but only weakly corroborated (low correlation confidence).
    const weaklyCorroborated = computeWhyNow(
      correlation({ latest_signal_at: "2026-09-10T00:00:00Z", confidence: "low" }),
      NOW,
    );
    expect(weaklyCorroborated.timingStrength).toBe("high");
    expect(weaklyCorroborated.confidence).toBe("low");

    // Well corroborated (high correlation confidence) but stale (low timing strength).
    const stale = computeWhyNow(correlation({ latest_signal_at: "2026-01-01T00:00:00Z", confidence: "high" }), NOW);
    expect(stale.timingStrength).toBe("low");
    expect(stale.confidence).toBe("low");

    // Both strong -> confidence is high too.
    const strong = computeWhyNow(
      correlation({ latest_signal_at: "2026-09-11T00:00:00Z", confidence: "high" }),
      NOW,
    );
    expect(strong.confidence).toBe("high");
  });

  it("never invents urgency language -- the summary is the correlation's own rationale plus a factual timestamp", () => {
    const result = computeWhyNow(
      correlation({ rationale: "Identity modernization activity (single signal -- insufficient corroboration on its own)" }),
      NOW,
    );
    expect(result.summary).toBe(
      "Identity modernization activity (single signal -- insufficient corroboration on its own) (most recently observed 1 day ago)",
    );
  });
});
