/**
 * The proxy file itself is a thin re-export — the enforcement logic lives in
 * `updateSession` (tested in packages/core/src/db/update-session.test.ts). What is worth
 * pinning here is the matcher: a path it fails to cover is a path where neither the auth
 * boundary nor the licence route guard runs at all.
 */
import { describe, expect, it, vi } from "vitest";

const { updateSession } = vi.hoisted(() => ({ updateSession: vi.fn(() => "response") }));
vi.mock("@cofounderai/core/db/middleware", () => ({ updateSession }));

const { config, proxy } = await import("./proxy");

/** Applies the exported matcher the way Next does, to decide if a path is intercepted. */
function matches(pathname: string) {
  return config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(pathname));
}

describe("proxy", () => {
  it("delegates the request to updateSession", async () => {
    const request = { nextUrl: { pathname: "/dashboard" } };

    await expect(proxy(request as never)).resolves.toBe("response");
    expect(updateSession).toHaveBeenCalledWith(request);
  });
});

describe("matcher", () => {
  it.each([
    "/",
    "/login",
    "/signup",
    "/dashboard",
    "/dashboard/businesses/biz-1/inventory/products",
    "/dashboard/settings/licenses",
    "/api/webhooks/email-inbound",
  ])("intercepts %s", (pathname) => {
    expect(matches(pathname)).toBe(true);
  });

  it.each([
    "/_next/static/chunks/main.js",
    "/_next/image",
    "/favicon.ico",
    "/logo.svg",
    "/hero.png",
    "/photo.jpeg",
    "/animation.gif",
    "/image.webp",
  ])("skips the static asset %s", (pathname) => {
    expect(matches(pathname)).toBe(false);
  });

  it("still intercepts a dashboard route that merely contains an asset-like segment", () => {
    expect(matches("/dashboard/businesses/biz-1/svg-tools")).toBe(true);
  });
});
