import { describe, expect, it } from "vitest";
import { deriveFulfillmentCommitmentState, suggestFulfillmentRequirement } from "./fulfillment";

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

describe("deriveFulfillmentCommitmentState", () => {
  it("maps draft to pending reservation", () => {
    expect(deriveFulfillmentCommitmentState("draft")).toEqual({ state: "pending", label: "Pending reservation" });
  });

  it("maps confirmed, processing, packed, and shipped to reserved", () => {
    for (const status of ["confirmed", "processing", "packed", "shipped"]) {
      expect(deriveFulfillmentCommitmentState(status)).toEqual({ state: "reserved", label: "Reserved" });
    }
  });

  it("maps delivered to fulfilled", () => {
    expect(deriveFulfillmentCommitmentState("delivered")).toEqual({ state: "fulfilled", label: "Fulfilled" });
  });

  it("maps cancelled and returned to the cancelled state with distinct labels", () => {
    expect(deriveFulfillmentCommitmentState("cancelled")).toEqual({ state: "cancelled", label: "Cancelled" });
    expect(deriveFulfillmentCommitmentState("returned")).toEqual({ state: "cancelled", label: "Returned" });
  });

  it("falls back to the raw status for anything unrecognized", () => {
    expect(deriveFulfillmentCommitmentState("weird")).toEqual({ state: "pending", label: "weird" });
  });
});
