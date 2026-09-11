import { describe, expect, it } from "vitest";
import { deriveSeniority } from "./seniority";

describe("deriveSeniority", () => {
  it("returns unknown when there is no job title on file", () => {
    expect(deriveSeniority(null)).toBe("unknown");
    expect(deriveSeniority("  ")).toBe("unknown");
  });

  it("classifies C-level titles", () => {
    expect(deriveSeniority("Chief Information Security Officer")).toBe("c_level");
    expect(deriveSeniority("CISO")).toBe("c_level");
    expect(deriveSeniority("Founder")).toBe("c_level");
  });

  it("classifies VP titles", () => {
    expect(deriveSeniority("VP of Engineering")).toBe("vp");
    expect(deriveSeniority("Senior Vice President, Sales")).toBe("vp");
  });

  it("classifies Director titles", () => {
    expect(deriveSeniority("Director of IAM")).toBe("director");
    expect(deriveSeniority("Head of Security")).toBe("director");
  });

  it("classifies Manager titles", () => {
    expect(deriveSeniority("Engineering Manager")).toBe("manager");
    expect(deriveSeniority("Team Lead")).toBe("manager");
  });

  it("falls back to individual_contributor for a real, unrecognized title", () => {
    expect(deriveSeniority("Security Analyst")).toBe("individual_contributor");
  });
});
