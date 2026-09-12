import { describe, expect, it } from "vitest";
import {
  activeBusinessIdFromPath,
  findPlatformDisabledModuleForRoute,
  findUnlicensedModuleForRoute,
  isProtectedPath,
  isUnlicensedModuleRoute,
} from "./middleware";

describe("isProtectedPath", () => {
  it("protects the customer dashboard", () => {
    expect(isProtectedPath("/dashboard/businesses/abc-123/products/xyz")).toBe(true);
  });

  it("protects the platform admin control plane (PLATFORM-P0-01.2)", () => {
    expect(isProtectedPath("/platform")).toBe(true);
    expect(isProtectedPath("/platform/dashboard")).toBe(true);
  });

  it("leaves public routes alone", () => {
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/signup")).toBe(false);
    expect(isProtectedPath("/")).toBe(false);
  });
});

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

describe("findUnlicensedModuleForRoute", () => {
  it("returns the blocked module's key, not just a boolean -- the not-licensed page needs it to render which module", () => {
    const pathname = "/dashboard/businesses/abc-123/inventory/products";
    expect(findUnlicensedModuleForRoute(pathname, new Set())).toBe("inventory");
  });

  it("returns null when the route is licensed", () => {
    const pathname = "/dashboard/businesses/abc-123/inventory/products";
    expect(findUnlicensedModuleForRoute(pathname, new Set(["inventory"]))).toBeNull();
  });
});

describe("findPlatformDisabledModuleForRoute (PLATFORM-P0-07.2)", () => {
  it("returns the module's key when a superadmin has disabled it platform-wide", () => {
    const pathname = "/dashboard/businesses/abc-123/inventory/products";
    expect(findPlatformDisabledModuleForRoute(pathname, new Set(["inventory"]))).toBe("inventory");
  });

  it("returns null when the module is not platform-disabled", () => {
    const pathname = "/dashboard/businesses/abc-123/inventory/products";
    expect(findPlatformDisabledModuleForRoute(pathname, new Set())).toBeNull();
  });

  it("is independent of any license -- a platform-disabled module blocks even with no licensed-module context at all", () => {
    expect(findPlatformDisabledModuleForRoute("/fsm/jobs", new Set(["fsm"]))).toBe("fsm");
  });

  it("does not false-positive on a path that merely contains a prefix as a substring", () => {
    expect(findPlatformDisabledModuleForRoute("/fsmxyz", new Set(["fsm"]))).toBeNull();
  });
});
