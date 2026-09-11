import { describe, expect, it } from "vitest";
import { deriveContactability } from "./contactability";

describe("deriveContactability", () => {
  it("rates two or more channels as high", () => {
    const result = deriveContactability({ email: "a@b.com", phone: "555-1234", linkedin_url: null });
    expect(result.level).toBe("high");
  });

  it("rates exactly one channel as medium", () => {
    const result = deriveContactability({ email: "a@b.com", phone: null, linkedin_url: null });
    expect(result.level).toBe("medium");
    expect(result.reason).toContain("email");
  });

  it("rates no channels as low", () => {
    const result = deriveContactability({ email: null, phone: null, linkedin_url: null });
    expect(result.level).toBe("low");
  });
});
