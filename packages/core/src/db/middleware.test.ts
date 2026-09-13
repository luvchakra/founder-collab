import { describe, expect, it } from "vitest";
import {
  activeBusinessSlugFromPath,
  findPlatformDisabledModuleForRoute,
  findUnlicensedModuleForRoute,
  isProtectedPath,
  isUnlicensedModuleRoute,
} from "./middleware";

describe("isProtectedPath", () => {
  it("protects the customer dashboard", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/dashboard/settings/profile")).toBe(true);
  });

  it("protects the platform admin control plane (PLATFORM-P0-01.2)", () => {
    expect(isProtectedPath("/platform")).toBe(true);
    expect(isProtectedPath("/platform/dashboard")).toBe(true);
  });

  it("protects a business-scoped route addressed by its slug", () => {
    expect(isProtectedPath("/acme-hvac")).toBe(true);
    expect(isProtectedPath("/acme-hvac/products/xyz")).toBe(true);
    expect(isProtectedPath("/acme-hvac/inventory/products")).toBe(true);
  });

  it("leaves public/reserved top-level routes alone", () => {
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/signup")).toBe(false);
    expect(isProtectedPath("/forgot-password")).toBe(false);
    expect(isProtectedPath("/reset-password")).toBe(false);
    expect(isProtectedPath("/onboarding")).toBe(false);
    expect(isProtectedPath("/auth/callback")).toBe(false);
    expect(isProtectedPath("/api/some/route")).toBe(false);
    expect(isProtectedPath("/p/some-token")).toBe(false);
    expect(isProtectedPath("/")).toBe(false);
  });
});

describe("activeBusinessSlugFromPath", () => {
  it("extracts the business slug from a business-scoped path", () => {
    expect(activeBusinessSlugFromPath("/acme-hvac/products/xyz")).toBe("acme-hvac");
  });

  it("returns null under /dashboard or /platform", () => {
    expect(activeBusinessSlugFromPath("/dashboard/settings/profile")).toBeNull();
    expect(activeBusinessSlugFromPath("/platform/dashboard")).toBeNull();
  });

  it("returns null for a reserved top-level path", () => {
    expect(activeBusinessSlugFromPath("/login")).toBeNull();
    expect(activeBusinessSlugFromPath("/onboarding")).toBeNull();
  });

  it("returns null for the root path", () => {
    expect(activeBusinessSlugFromPath("/")).toBeNull();
  });
});

describe("isUnlicensedModuleRoute", () => {
  it("is a no-op for discovery's real route shape (not under any module's routePrefix)", () => {
    const pathname = "/acme-hvac/products/xyz/prospects";
    expect(isUnlicensedModuleRoute(pathname, new Set())).toBe(false);
  });

  it("blocks a business-scoped module route the business hasn't licensed", () => {
    const pathname = "/acme-hvac/inventory/products";
    expect(isUnlicensedModuleRoute(pathname, new Set())).toBe(true);
  });

  it("allows a business-scoped module route the business has licensed", () => {
    const pathname = "/acme-hvac/inventory/products";
    expect(isUnlicensedModuleRoute(pathname, new Set(["inventory"]))).toBe(false);
  });

  it("blocks the [businessSlug]/<prefix> shape when unlicensed", () => {
    expect(isUnlicensedModuleRoute("/acme-hvac/fsm/jobs", new Set())).toBe(true);
    expect(isUnlicensedModuleRoute("/acme-hvac/fsm/jobs", new Set(["fsm"]))).toBe(false);
  });

  it("does not match a bare module prefix with no business slug segment ahead of it", () => {
    expect(isUnlicensedModuleRoute("/fsm/jobs", new Set())).toBe(false);
  });

  it("does not false-positive on a path that merely contains a prefix as a substring", () => {
    // "/acme-hvac/fsmxyz" should not match the "/fsm" prefix -- the regex requires a path
    // boundary (end of string or "/") right after the prefix.
    expect(isUnlicensedModuleRoute("/acme-hvac/fsmxyz", new Set())).toBe(false);
  });
});

describe("findUnlicensedModuleForRoute", () => {
  it("returns the blocked module's key, not just a boolean -- the not-licensed page needs it to render which module", () => {
    const pathname = "/acme-hvac/inventory/products";
    expect(findUnlicensedModuleForRoute(pathname, new Set())).toBe("inventory");
  });

  it("returns null when the route is licensed", () => {
    const pathname = "/acme-hvac/inventory/products";
    expect(findUnlicensedModuleForRoute(pathname, new Set(["inventory"]))).toBeNull();
  });
});

describe("findPlatformDisabledModuleForRoute (PLATFORM-P0-07.2)", () => {
  it("returns the module's key when a superadmin has disabled it platform-wide", () => {
    const pathname = "/acme-hvac/inventory/products";
    expect(findPlatformDisabledModuleForRoute(pathname, new Set(["inventory"]))).toBe("inventory");
  });

  it("returns null when the module is not platform-disabled", () => {
    const pathname = "/acme-hvac/inventory/products";
    expect(findPlatformDisabledModuleForRoute(pathname, new Set())).toBeNull();
  });

  it("is independent of any license -- a platform-disabled module blocks even with no licensed-module context at all", () => {
    expect(findPlatformDisabledModuleForRoute("/acme-hvac/fsm/jobs", new Set(["fsm"]))).toBe("fsm");
  });

  it("does not false-positive on a path that merely contains a prefix as a substring", () => {
    expect(findPlatformDisabledModuleForRoute("/acme-hvac/fsmxyz", new Set(["fsm"]))).toBeNull();
  });
});
