import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins plain class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy values so conditional classes can be inlined", () => {
    expect(cn("a", false && "b", undefined, null, "c")).toBe("a c");
  });

  it("accepts arrays and conditional objects", () => {
    expect(cn(["a", "b"], { c: true, d: false })).toBe("a b c");
  });

  it("lets a later Tailwind class win over an earlier conflicting one", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm text-muted-foreground", "text-lg")).toBe("text-muted-foreground text-lg");
  });

  it("keeps non-conflicting Tailwind utilities side by side", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4");
  });

  it("returns an empty string for no input", () => {
    expect(cn()).toBe("");
  });
});
