/**
 * The drain cron route is reachable by anyone who can guess the URL, so its shared-secret
 * check is the only thing standing between the public internet and a service-role drain
 * pass. These tests pin the closed-by-default behaviour — in particular that an unset
 * CRON_SECRET denies rather than allows, which is the failure mode that would otherwise
 * only show up in a misconfigured deployment.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { drainDomainEvents } = vi.hoisted(() => ({ drainDomainEvents: vi.fn() }));
vi.mock("@cofounderai/core/events/drain", () => ({ drainDomainEvents }));

const { GET } = await import("./route");

const SECRET = "cron-secret-value";

function request(authorization?: string) {
  return new Request("https://example.com/api/cron/drain-events", {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  drainDomainEvents.mockResolvedValue({ processed: 2, parked: 1, failed: 0 });
  vi.stubEnv("CRON_SECRET", SECRET);
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/drain-events", () => {
  it("drains and returns the tally for a correctly authenticated scheduler", async () => {
    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ processed: 2, parked: 1, failed: 0 });
    expect(drainDomainEvents).toHaveBeenCalledOnce();
  });

  it("rejects a request with no Authorization header", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(drainDomainEvents).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const response = await GET(request("Bearer not-the-secret"));

    expect(response.status).toBe(401);
    expect(drainDomainEvents).not.toHaveBeenCalled();
  });

  it("rejects the right secret sent without the Bearer scheme", async () => {
    expect((await GET(request(SECRET))).status).toBe(401);
    expect(drainDomainEvents).not.toHaveBeenCalled();
  });

  it("denies everything when CRON_SECRET is unset, rather than running unauthenticated", async () => {
    vi.stubEnv("CRON_SECRET", "");

    expect((await GET(request("Bearer "))).status).toBe(401);
    expect((await GET(request())).status).toBe(401);
    expect(drainDomainEvents).not.toHaveBeenCalled();
  });
});
