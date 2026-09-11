import { describe, expect, it } from "vitest";
import { suggestFulfillmentRequirement } from "./fulfillment";

describe("suggestFulfillmentRequirement", () => {
  it("suggests product_and_service when both products and an FSM engagement exist", () => {
    expect(suggestFulfillmentRequirement(true, true)).toBe("product_and_service");
  });

  it("suggests inventory_required for products with no FSM engagement", () => {
    expect(suggestFulfillmentRequirement(true, false)).toBe("inventory_required");
  });

  it("suggests service_only for an FSM engagement with no products", () => {
    expect(suggestFulfillmentRequirement(false, true)).toBe("service_only");
  });

  it("suggests not_required when neither applies", () => {
    expect(suggestFulfillmentRequirement(false, false)).toBe("not_required");
  });
});
