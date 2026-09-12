import { describe, expect, it } from "vitest";
import { validateRelatedEntityPair } from "./mutations";

describe("validateRelatedEntityPair", () => {
  it("accepts both provided", () => {
    expect(validateRelatedEntityPair("return_period", "period-1")).toBeNull();
  });

  it("accepts neither provided", () => {
    expect(validateRelatedEntityPair(undefined, undefined)).toBeNull();
  });

  it("rejects type without id", () => {
    expect(validateRelatedEntityPair("return_period", undefined)).toContain("together");
  });

  it("rejects id without type", () => {
    expect(validateRelatedEntityPair(undefined, "period-1")).toContain("together");
  });
});
