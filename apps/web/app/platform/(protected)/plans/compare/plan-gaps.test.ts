import { describe, expect, it } from "vitest";
import { findPlanGaps } from "./plan-gaps";

const ALL = ["crm", "discovery", "fsm", "gst", "inventory"];

describe("findPlanGaps", () => {
  it("flags every paid plan when all plans include every module (production on 2026-10-10)", () => {
    const gaps = findPlanGaps([
      { id: "free", name: "Free", price: 0, modules: ALL },
      { id: "pro", name: "Pro", price: 2999, modules: ALL },
      { id: "max", name: "Max", price: 9999, modules: ALL },
    ]);
    expect(gaps).toEqual([
      { planId: "pro", planName: "Pro", cheaperPlanName: "Free" },
      { planId: "max", planName: "Max", cheaperPlanName: "Pro" },
    ]);
  });

  it("compares each paid plan with the next cheaper one only", () => {
    const gaps = findPlanGaps([
      { id: "free", name: "Free", price: 0, modules: ["discovery"] },
      { id: "pro", name: "Pro", price: 2999, modules: ["discovery", "crm"] },
      { id: "max", name: "Max", price: 9999, modules: ALL },
    ]);
    expect(gaps).toEqual([]);
  });

  it("flags a paid plan that includes fewer modules than a cheaper one", () => {
    const gaps = findPlanGaps([
      { id: "free", name: "Free", price: 0, modules: ["discovery", "crm"] },
      { id: "pro", name: "Pro", price: 2999, modules: ["discovery"] },
    ]);
    expect(gaps.map((g) => g.planName)).toEqual(["Pro"]);
  });

  it("never flags a free plan or the only plan", () => {
    expect(findPlanGaps([{ id: "free", name: "Free", price: 0, modules: [] }])).toEqual([]);
    expect(findPlanGaps([{ id: "pro", name: "Pro", price: 10, modules: [] }])).toEqual([]);
  });
});
