import { describe, expect, it } from "vitest";
import { getActiveIdsFromPath } from "./active-path";

describe("getActiveIdsFromPath", () => {
  it("extracts both ids from a full product-scoped path", () => {
    expect(getActiveIdsFromPath("/dashboard/businesses/biz-1/products/prod-9/prospects")).toEqual({
      businessId: "biz-1",
      productId: "prod-9",
    });
  });

  it("extracts the business id alone on a business-scoped path", () => {
    expect(getActiveIdsFromPath("/dashboard/businesses/biz-1")).toEqual({
      businessId: "biz-1",
      productId: null,
    });
  });

  it("returns nulls for a path with no tenancy segments", () => {
    expect(getActiveIdsFromPath("/dashboard/settings/profile")).toEqual({
      businessId: null,
      productId: null,
    });
  });

  it("stops at the segment boundary rather than swallowing the rest of the path", () => {
    expect(getActiveIdsFromPath("/dashboard/businesses/biz-1/usage").businessId).toBe("biz-1");
  });

  it("returns null for a trailing 'businesses' segment with no id", () => {
    expect(getActiveIdsFromPath("/dashboard/businesses").businessId).toBeNull();
  });
});
