import { describe, expect, it } from "vitest";
import { updateSubscriptionTaxSchema } from "./platform-billing";

// PLATFORM-P1-05.3: a rate needs a tax name; zero means no tax is shown.
describe("updateSubscriptionTaxSchema", () => {
  const base = { label: "GST", rate: 18, pricesIncludeTax: true, reason: "18% GST included" };

  it("accepts a named rate", () => {
    expect(updateSubscriptionTaxSchema.safeParse(base).success).toBe(true);
  });

  it("requires a name when the rate is above zero", () => {
    const result = updateSubscriptionTaxSchema.safeParse({ ...base, label: " " });
    expect(result.success).toBe(false);
  });

  it("allows no name when there is no tax", () => {
    expect(updateSubscriptionTaxSchema.safeParse({ ...base, label: "", rate: 0 }).success).toBe(true);
  });

  it("rejects out-of-range rates and a missing reason", () => {
    expect(updateSubscriptionTaxSchema.safeParse({ ...base, rate: 51 }).success).toBe(false);
    expect(updateSubscriptionTaxSchema.safeParse({ ...base, rate: -1 }).success).toBe(false);
    expect(updateSubscriptionTaxSchema.safeParse({ ...base, reason: "" }).success).toBe(false);
  });
});
