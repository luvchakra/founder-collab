import { describe, expect, it } from "vitest";
import { computeTargetEscalationStage } from "./mutations";
import { DEFAULT_ESCALATION_CONFIG } from "./types";

describe("computeTargetEscalationStage", () => {
  it("returns null before the reminder delay has elapsed", () => {
    expect(computeTargetEscalationStage(5, DEFAULT_ESCALATION_CONFIG)).toBeNull();
  });

  it("returns 'reminder' once the reminder delay has elapsed but not the owner one", () => {
    expect(computeTargetEscalationStage(15, DEFAULT_ESCALATION_CONFIG)).toBe("reminder");
    expect(computeTargetEscalationStage(59, DEFAULT_ESCALATION_CONFIG)).toBe("reminder");
  });

  it("returns 'owner_escalation' once the owner delay has elapsed but not the manager one", () => {
    expect(computeTargetEscalationStage(60, DEFAULT_ESCALATION_CONFIG)).toBe("owner_escalation");
    expect(computeTargetEscalationStage(239, DEFAULT_ESCALATION_CONFIG)).toBe("owner_escalation");
  });

  it("returns 'manager_escalation' once the manager delay has elapsed", () => {
    expect(computeTargetEscalationStage(240, DEFAULT_ESCALATION_CONFIG)).toBe("manager_escalation");
    expect(computeTargetEscalationStage(10_000, DEFAULT_ESCALATION_CONFIG)).toBe("manager_escalation");
  });

  it("jumps straight to the highest reached stage rather than requiring one rung at a time", () => {
    // Simulates a sweep that missed several runs -- the interaction should land on
    // manager_escalation immediately, not need three separate sweeps to climb there.
    expect(computeTargetEscalationStage(500, DEFAULT_ESCALATION_CONFIG)).toBe("manager_escalation");
  });

  it("respects a business's own configured delays, not just the defaults", () => {
    const customConfig = { reminderDelayMinutes: 5, ownerEscalationDelayMinutes: 10, managerEscalationDelayMinutes: 20 };
    expect(computeTargetEscalationStage(6, customConfig)).toBe("reminder");
    expect(computeTargetEscalationStage(12, customConfig)).toBe("owner_escalation");
    expect(computeTargetEscalationStage(25, customConfig)).toBe("manager_escalation");
  });
});
