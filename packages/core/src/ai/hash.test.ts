import { describe, expect, it } from "vitest";
import { hashInput } from "./hash";

describe("hashInput", () => {
  it("is deterministic for the same value", () => {
    expect(hashInput({ a: 1, b: "x" })).toBe(hashInput({ a: 1, b: "x" }));
  });

  it("differs for different values", () => {
    expect(hashInput({ a: 1 })).not.toBe(hashInput({ a: 2 }));
  });

  it("returns a hex sha256 digest", () => {
    expect(hashInput("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});
