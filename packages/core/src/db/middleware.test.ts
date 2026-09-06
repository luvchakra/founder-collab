import { describe, expect, it } from "vitest";
import { activeBusinessIdFromPath, isUnlicensedModuleRoute } from "./middleware";

describe("activeBusinessIdFromPath", () => {
  it("extracts the business id from a business-scoped dashboard path", () => {
    expect(activeBusinessIdFromPath("/dashboard/businesses/abc-123/products/xyz")).toBe(
      "abc-123",
    );
  });

  it("returns null for a path with no business segment", () => {
    expect(activeBusinessIdFromPath("/dashboard/settings/profile")).toBeNull();
  });
});

describe("isUnlicensedModuleRoute", () => {
  it("is a no-op for discovery's real route shape (not under any module's routePrefix)", () => {
    const pathname = "/dashboard/businesses/abc-123/products/xyz/prospects";
    expect(isUnlicensedModuleRoute(pathname, new Set())).toBe(false);
  });

  it("blocks a business-scoped module route the business hasn't licensed", () => {
    const pathname = "/dashboard/businesses/abc-123/inventory/products";
    expect(isUnlicensedModuleRoute(pathname, new Set())).toBe(true);
  });

  it("allows a business-scoped module route the business has licensed", () => {
    const pathname = "/dashboard/businesses/abc-123/inventory/products";
    expect(isUnlicensedModuleRoute(pathname, new Set(["inventory"]))).toBe(false);
  });

  it("blocks the eventual top-level [businessSlug]/<prefix> shape when unlicensed", () => {
    expect(isUnlicensedModuleRoute("/fsm/jobs", new Set())).toBe(true);
    expect(isUnlicensedModuleRoute("/fsm/jobs", new Set(["fsm"]))).toBe(false);
  });

  it("does not false-positive on a path that merely contains a prefix as a substring", () => {
    // "/fsmxyz" should not match the "/fsm" prefix -- the regex requires a path
    // boundary (end of string or "/") right after the prefix.
    expect(isUnlicensedModuleRoute("/fsmxyz", new Set())).toBe(false);
  });
});
