/**
 * `updateSession` is licensing enforcement layer 2 (the route guard) plus the
 * authenticated/unauthenticated boundary, and it runs on essentially every request. The
 * behaviours pinned here are the ones whose failure modes are silent: an unlicensed
 * module route must 404 rather than render ("don't advertise", per CLAUDE.md), the
 * entitlement query must only count licences that are active or in grace, and the
 * session-refresh response must still be returned on the pass-through path or every
 * request would drop its refreshed cookie.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { createServerClient } = vi.hoisted(() => ({ createServerClient: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient }));

const { updateSession } = await import("./middleware");

const USER = { id: "u1", email: "ada@example.com" };

/**
 * Wires up the two clients `updateSession` builds: the first is the auth client, any
 * later one is the core-schema entitlement client. `licenses` is what the licences query
 * returns; the query builder records its own filters for assertion.
 */
function mockClients({ user, licenses = [] }: { user: unknown; licenses?: { module_key: string }[] }) {
  const recorded: { filters: Record<string, unknown>; statuses?: unknown } = { filters: {} };

  const licenseQuery = {
    select: () => licenseQuery,
    eq: (col: string, val: unknown) => {
      recorded.filters[col] = val;
      return licenseQuery;
    },
    in: (_col: string, vals: unknown) => {
      recorded.statuses = vals;
      return Promise.resolve({ data: licenses });
    },
  };

  createServerClient.mockImplementation((_url: string, _key: string, options: { db?: unknown }) =>
    options?.db
      ? { from: () => licenseQuery }
      : { auth: { getUser: async () => ({ data: { user } }) } },
  );

  return recorded;
}

function request(pathname: string): NextRequest {
  const url = new URL(`https://app.example.com${pathname}`);
  return {
    nextUrl: Object.assign(url, { clone: () => new URL(url.toString()) }),
    cookies: { getAll: () => [], set: () => {} },
    headers: new Headers(),
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
});

describe("updateSession — auth boundary", () => {
  it("redirects an anonymous visitor away from a protected route", async () => {
    mockClients({ user: null });

    const response = await updateSession(request("/dashboard/settings/profile"));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });

  it("lets an anonymous visitor through to a public route", async () => {
    mockClients({ user: null });

    const response = await updateSession(request("/"));

    expect(response.status).toBe(200);
  });

  it.each(["/login", "/signup"])("bounces a signed-in user off %s to the dashboard", async (path) => {
    mockClients({ user: USER });

    const response = await updateSession(request(path));

    expect(new URL(response.headers.get("location")!).pathname).toBe("/dashboard");
  });

  it("leaves a signed-in user on a protected route with no business segment", async () => {
    mockClients({ user: USER });

    const response = await updateSession(request("/dashboard/settings/profile"));

    expect(response.status).toBe(200);
  });

  it("does not run the entitlement query when there is no business in the path", async () => {
    mockClients({ user: USER });

    await updateSession(request("/dashboard/settings/profile"));

    // Only the auth client is ever constructed.
    expect(createServerClient).toHaveBeenCalledTimes(1);
  });

  it("does not run the entitlement query for an anonymous visitor", async () => {
    mockClients({ user: null });

    await updateSession(request("/"));

    expect(createServerClient).toHaveBeenCalledTimes(1);
  });
});

describe("updateSession — module route guard", () => {
  it("404s a business-scoped module route the business has not licensed", async () => {
    mockClients({ user: USER, licenses: [] });

    const response = await updateSession(request("/dashboard/businesses/biz-1/inventory/products"));

    expect(response.status).toBe(404);
  });

  it("allows the same route once the module is licensed", async () => {
    mockClients({ user: USER, licenses: [{ module_key: "inventory" }] });

    const response = await updateSession(request("/dashboard/businesses/biz-1/inventory/products"));

    expect(response.status).toBe(200);
  });

  it("does not gate discovery's own route shape, which sits under no module prefix", async () => {
    mockClients({ user: USER, licenses: [] });

    const response = await updateSession(
      request("/dashboard/businesses/biz-1/products/prod-1/prospects"),
    );

    expect(response.status).toBe(200);
  });

  it("scopes the entitlement query to the business in the URL", async () => {
    const recorded = mockClients({ user: USER, licenses: [] });

    await updateSession(request("/dashboard/businesses/biz-42/inventory"));

    expect(recorded.filters).toEqual({ business_id: "biz-42" });
  });

  it("counts only active and grace licences — an expired one must not open the route", async () => {
    const recorded = mockClients({ user: USER, licenses: [] });

    await updateSession(request("/dashboard/businesses/biz-1/inventory"));

    expect(recorded.statuses).toEqual(["active", "grace"]);
  });

  it("treats a grace-period licence as still granting access (ADR-9's read-only window)", async () => {
    mockClients({ user: USER, licenses: [{ module_key: "inventory" }] });

    const response = await updateSession(request("/dashboard/businesses/biz-1/inventory"));

    expect(response.status).toBe(200);
  });

  it("gates each module independently", async () => {
    mockClients({ user: USER, licenses: [{ module_key: "inventory" }] });
    expect((await updateSession(request("/dashboard/businesses/biz-1/fsm/jobs"))).status).toBe(404);

    mockClients({ user: USER, licenses: [{ module_key: "fsm" }] });
    expect((await updateSession(request("/dashboard/businesses/biz-1/fsm/jobs"))).status).toBe(200);
  });

  it("returns an empty body with the 404, rather than leaking that the route exists", async () => {
    mockClients({ user: USER, licenses: [] });

    const response = await updateSession(request("/dashboard/businesses/biz-1/gst/returns"));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  it("treats a null licences result as no entitlements", async () => {
    createServerClient.mockImplementation((_u: string, _k: string, options: { db?: unknown }) =>
      options?.db
        ? { from: () => ({ select: () => ({ eq: () => ({ in: async () => ({ data: null }) }) }) }) }
        : { auth: { getUser: async () => ({ data: { user: USER } }) } },
    );

    const response = await updateSession(request("/dashboard/businesses/biz-1/inventory"));

    expect(response.status).toBe(404);
  });
});
