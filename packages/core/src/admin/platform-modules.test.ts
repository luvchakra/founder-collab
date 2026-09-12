import { describe, expect, it } from "vitest";
import { computeMinimumPlans } from "./platform-modules";

/**
 * PLATFORM-P0-07.1 ("Module Registry") -- `computeMinimumPlans()` is the pure derivation
 * behind the registry's "minimum plan" column: it must never fabricate an answer nor treat
 * a plan a customer can't actually buy (draft/deprecated/archived) as a real minimum.
 */
describe("computeMinimumPlans (PLATFORM-P0-07.1)", () => {
  const free = { id: "p-free", key: "free", name: "Free", display_order: 0, status: "active" };
  const pro = { id: "p-pro", key: "pro", name: "Pro", display_order: 1, status: "active" };
  const max = { id: "p-max", key: "max", name: "Max", display_order: 2, status: "active" };
  const draft = { id: "p-draft", key: "draft-plan", name: "Draft Plan", display_order: -1, status: "draft" };

  it("picks the lowest-display_order active plan that enables the module", () => {
    const result = computeMinimumPlans(
      [
        { module_key: "fsm", enabled: true, plan_id: "p-pro" },
        { module_key: "fsm", enabled: true, plan_id: "p-max" },
      ],
      [free, pro, max],
    );
    expect(result.get("fsm")).toEqual({ key: "pro", name: "Pro" });
  });

  it("ignores a disabled plan_modules row even if it has a lower display_order", () => {
    const result = computeMinimumPlans(
      [
        { module_key: "fsm", enabled: false, plan_id: "p-free" },
        { module_key: "fsm", enabled: true, plan_id: "p-pro" },
      ],
      [free, pro, max],
    );
    expect(result.get("fsm")).toEqual({ key: "pro", name: "Pro" });
  });

  it("ignores a non-active plan (draft/deprecated/archived) even if it enables the module", () => {
    const result = computeMinimumPlans(
      [{ module_key: "fsm", enabled: true, plan_id: "p-draft" }],
      [free, pro, max, draft],
    );
    expect(result.get("fsm")).toBeUndefined();
  });

  it("returns no entry for a module no active plan currently includes", () => {
    const result = computeMinimumPlans([], [free, pro, max]);
    expect(result.get("fsm")).toBeUndefined();
    expect(result.size).toBe(0);
  });

  it("handles multiple modules independently", () => {
    const result = computeMinimumPlans(
      [
        { module_key: "fsm", enabled: true, plan_id: "p-max" },
        { module_key: "discovery", enabled: true, plan_id: "p-free" },
      ],
      [free, pro, max],
    );
    expect(result.get("fsm")).toEqual({ key: "max", name: "Max" });
    expect(result.get("discovery")).toEqual({ key: "free", name: "Free" });
  });
});
