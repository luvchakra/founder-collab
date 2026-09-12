import { describe, expect, it } from "vitest";
import { createPlatformPlanSchema, updatePlatformPlanSchema } from "./platform-plans";

const validInput = {
  key: "growth",
  name: "Growth",
  description: "For teams scaling past the basics.",
  price: 2999,
  billingInterval: "month" as const,
  currency: "inr",
  status: "active" as const,
  displayOrder: 1,
  marketingVisible: true,
};

describe("createPlatformPlanSchema (PLATFORM-P0-04.1)", () => {
  it("accepts a fully populated, valid input", () => {
    const result = createPlatformPlanSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("lowercases the key and uppercases the currency", () => {
    const result = createPlatformPlanSchema.safeParse({ ...validInput, key: "GROWTH", currency: "inr" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.key).toBe("growth");
      expect(result.data.currency).toBe("INR");
    }
  });

  it("rejects a key with spaces, hyphens, or other non-slug characters", () => {
    expect(createPlatformPlanSchema.safeParse({ ...validInput, key: "growth plan" }).success).toBe(false);
    expect(createPlatformPlanSchema.safeParse({ ...validInput, key: "growth-plan" }).success).toBe(false);
    expect(createPlatformPlanSchema.safeParse({ ...validInput, key: "" }).success).toBe(false);
  });

  it("requires a non-empty plan name", () => {
    expect(createPlatformPlanSchema.safeParse({ ...validInput, name: "  " }).success).toBe(false);
  });

  it("turns an empty description into null", () => {
    const result = createPlatformPlanSchema.safeParse({ ...validInput, description: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBeNull();
  });

  it("rejects a negative price", () => {
    expect(createPlatformPlanSchema.safeParse({ ...validInput, price: -1 }).success).toBe(false);
  });

  it("accepts a zero price (the Free plan)", () => {
    expect(createPlatformPlanSchema.safeParse({ ...validInput, price: 0 }).success).toBe(true);
  });

  it("rejects a billing interval outside month/year", () => {
    expect(createPlatformPlanSchema.safeParse({ ...validInput, billingInterval: "week" }).success).toBe(false);
  });

  it("rejects a currency code that isn't 3 letters", () => {
    expect(createPlatformPlanSchema.safeParse({ ...validInput, currency: "RS" }).success).toBe(false);
    expect(createPlatformPlanSchema.safeParse({ ...validInput, currency: "INDIAN" }).success).toBe(false);
  });

  it("rejects a status outside the four-value lifecycle (PLATFORM-P0-04.7)", () => {
    expect(createPlatformPlanSchema.safeParse({ ...validInput, status: "beta" }).success).toBe(false);
  });

  it("accepts every lifecycle status the story names", () => {
    for (const s of ["draft", "active", "deprecated", "archived"]) {
      expect(createPlatformPlanSchema.safeParse({ ...validInput, status: s }).success).toBe(true);
    }
  });

  it("rejects a non-integer display order", () => {
    expect(createPlatformPlanSchema.safeParse({ ...validInput, displayOrder: 1.5 }).success).toBe(false);
  });
});

describe("updatePlatformPlanSchema (PLATFORM-P0-04.1)", () => {
  it("has no key field at all -- a plan's key is immutable after creation", () => {
    const { key: _key, ...rest } = validInput;
    const result = updatePlatformPlanSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect("key" in result.data).toBe(false);
  });
});
