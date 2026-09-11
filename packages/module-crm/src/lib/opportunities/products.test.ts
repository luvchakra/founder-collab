import { describe, expect, it } from "vitest";
import { computeLineValue } from "./products";

describe("computeLineValue", () => {
  it("multiplies quantity by unit price when a quantity is set", () => {
    expect(computeLineValue(3, 250)).toBe(750);
  });

  it("returns null when no quantity has been captured", () => {
    expect(computeLineValue(null, 250)).toBeNull();
  });

  it("returns null for a zero quantity rather than a zero value", () => {
    expect(computeLineValue(0, 250)).toBeNull();
  });
});
