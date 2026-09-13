import { describe, expect, it } from "vitest";
import { getActiveIdsFromPath } from "./active-path";

describe("getActiveIdsFromPath", () => {
  it("extracts the business slug from a business-scoped path", () => {
    expect(getActiveIdsFromPath("/acme-hvac/inventory/dashboard")).toEqual({
      businessSlug: "acme-hvac",
      productId: null,
    });
  });

  it("extracts both the business slug and the product id", () => {
    expect(getActiveIdsFromPath("/acme-hvac/products/xyz/icp")).toEqual({
      businessSlug: "acme-hvac",
      productId: "xyz",
    });
  });

  it("returns a null business slug for the account-level dashboard", () => {
    expect(getActiveIdsFromPath("/dashboard").businessSlug).toBeNull();
    expect(getActiveIdsFromPath("/dashboard/settings/profile").businessSlug).toBeNull();
  });

  it("returns a null business slug for the platform control plane", () => {
    expect(getActiveIdsFromPath("/platform/modules").businessSlug).toBeNull();
  });

  it("returns null for the bare root", () => {
    expect(getActiveIdsFromPath("/")).toEqual({ businessSlug: null, productId: null });
  });
});
