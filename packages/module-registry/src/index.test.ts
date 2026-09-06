import { describe, expect, it } from "vitest";
import { getModule, moduleRegistry } from "./index";

describe("module registry", () => {
  it("starts empty until modules register themselves (story P-3)", () => {
    expect(moduleRegistry).toEqual([]);
  });

  it("returns undefined for a module that hasn't registered", () => {
    expect(getModule("fsm")).toBeUndefined();
  });
});
