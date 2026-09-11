import { describe, expect, it } from "vitest";
import { correlateSignals } from "./correlation";
import type { Signal } from "./types";

function signal(overrides: Partial<Signal>): Signal {
  return {
    id: "sig-1",
    workspace_id: "ws-1",
    prospect_id: "prospect-1",
    signal_type: "buying_signal",
    description: "New CISO",
    source: null,
    observed_at: "2026-09-01T00:00:00Z",
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("correlateSignals", () => {
  it("returns null when there is nothing to correlate", () => {
    expect(correlateSignals([])).toBeNull();
  });

  it("holds a single signal at low confidence and says so in its own rationale", () => {
    const result = correlateSignals([signal({ id: "sig-1", description: "New CISO" })]);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe("low");
    expect(result!.rationale).toBe("New CISO (single signal -- insufficient corroboration on its own)");
    expect(result!.signalIds).toEqual(["sig-1"]);
  });

  it("reaches medium confidence with exactly two corroborating signals", () => {
    const result = correlateSignals([
      signal({ id: "sig-1", description: "New CISO" }),
      signal({ id: "sig-2", description: "12 IAM/security openings" }),
    ]);
    expect(result!.confidence).toBe("medium");
    expect(result!.rationale).toBe("New CISO + 12 IAM/security openings");
  });

  it("reaches high confidence with three or more corroborating signals", () => {
    const result = correlateSignals([
      signal({ id: "sig-1", description: "New CISO" }),
      signal({ id: "sig-2", description: "12 IAM/security openings" }),
      signal({ id: "sig-3", description: "Identity modernization activity" }),
    ]);
    expect(result!.confidence).toBe("high");
    expect(result!.rationale).toBe("New CISO + 12 IAM/security openings + Identity modernization activity");
    expect(result!.signalIds).toEqual(["sig-1", "sig-2", "sig-3"]);
  });

  it("derives time context from observed_at regardless of input order", () => {
    const result = correlateSignals([
      signal({ id: "sig-2", observed_at: "2026-09-05T00:00:00Z" }),
      signal({ id: "sig-1", observed_at: "2026-08-01T00:00:00Z" }),
      signal({ id: "sig-3", observed_at: "2026-09-10T00:00:00Z" }),
    ]);
    expect(result!.earliestSignalAt).toBe("2026-08-01T00:00:00Z");
    expect(result!.latestSignalAt).toBe("2026-09-10T00:00:00Z");
  });
});
