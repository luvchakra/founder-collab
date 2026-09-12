import { describe, expect, it } from "vitest";
import { assertCanTransition, canTransition, nextStatus } from "./transitions";
import { RETURN_PERIOD_STATUSES } from "./types";
import type { ReturnPeriodStatus } from "./types";

const FORWARD_PATH: ReturnPeriodStatus[] = ["draft", "validated", "in_review", "approved", "filed"];

describe("nextStatus / canTransition", () => {
  it("walks the exact forward pipeline the backlog names: draft -> validated -> in_review -> approved -> filed", () => {
    for (let i = 0; i < FORWARD_PATH.length - 1; i++) {
      expect(nextStatus(FORWARD_PATH[i]!)).toBe(FORWARD_PATH[i + 1]);
      expect(canTransition(FORWARD_PATH[i]!, FORWARD_PATH[i + 1]!)).toBe(true);
    }
  });

  it("has no next stage from the terminal 'filed' status", () => {
    expect(nextStatus("filed")).toBeNull();
  });

  it("rejects skipping a stage (draft straight to approved)", () => {
    expect(canTransition("draft", "approved")).toBe(false);
  });

  it("rejects skipping a stage (validated straight to filed)", () => {
    expect(canTransition("validated", "filed")).toBe(false);
  });

  it("rejects every backward transition", () => {
    for (let i = 1; i < FORWARD_PATH.length; i++) {
      expect(canTransition(FORWARD_PATH[i]!, FORWARD_PATH[i - 1]!)).toBe(false);
    }
  });

  it("rejects a no-op transition to the same status", () => {
    for (const status of RETURN_PERIOD_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("covers every status with an entry in the forward map (no status silently falls through)", () => {
    for (const status of RETURN_PERIOD_STATUSES) {
      // Every status must resolve to either a real next status or null -- never undefined,
      // which would mean this status was left out of the map entirely.
      expect(nextStatus(status)).not.toBeUndefined();
    }
  });
});

describe("assertCanTransition", () => {
  it("does not throw for a legal transition", () => {
    expect(() => assertCanTransition("draft", "validated")).not.toThrow();
  });

  it("throws naming the one legal next stage for an illegal transition", () => {
    expect(() => assertCanTransition("draft", "approved")).toThrow(/only valid next stage is "validated"/);
  });

  it("throws a distinct message for the terminal status with no next stage at all", () => {
    expect(() => assertCanTransition("filed", "draft")).toThrow(/already at its final stage/);
  });
});
