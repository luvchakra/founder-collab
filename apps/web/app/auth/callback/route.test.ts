/**
 * The email-link callback exchanges a one-time code for a session cookie. Two things
 * must hold: a failed exchange must never land the visitor anywhere but /login, and the
 * `next` parameter — which arrives on the URL and is therefore attacker-controllable —
 * decides where a *successfully authenticated* visitor is sent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient }));

const { GET } = await import("./route");

const ORIGIN = "https://app.example.com";

function mockExchange(result: { error: unknown }) {
  const exchangeCodeForSession = vi.fn().mockResolvedValue(result);
  createClient.mockResolvedValue({ auth: { exchangeCodeForSession } });
  return exchangeCodeForSession;
}

function request(query: string) {
  return new Request(`${ORIGIN}/auth/callback${query}`);
}

beforeEach(() => vi.clearAllMocks());

describe("GET /auth/callback", () => {
  it("exchanges the code and redirects to the default destination", async () => {
    const exchange = mockExchange({ error: null });

    const response = await GET(request("?code=one-time-code"));

    expect(exchange).toHaveBeenCalledWith("one-time-code");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/dashboard`);
  });

  it("honours an explicit next destination", async () => {
    mockExchange({ error: null });

    const response = await GET(request("?code=c&next=/onboarding"));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/onboarding`);
  });

  it("redirects to login when the code is missing entirely", async () => {
    const exchange = mockExchange({ error: null });

    const response = await GET(request("?next=/onboarding"));

    expect(exchange).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(`${ORIGIN}/login`);
  });

  it("redirects to login when the exchange fails, ignoring next", async () => {
    mockExchange({ error: { message: "code expired" } });

    const response = await GET(request("?code=stale&next=/onboarding"));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/login`);
  });

  it("never redirects off-origin on the failure path", async () => {
    mockExchange({ error: { message: "bad" } });

    const response = await GET(request("?code=x&next=https://evil.example/steal"));

    expect(new URL(response.headers.get("location")!).origin).toBe(ORIGIN);
  });

  // `next` is attacker-controllable and is concatenated onto the origin without an
  // allowlist, so this pins the property that makes that safe: the result is parsed as a
  // URL relative to the app's own origin, which collapses an absolute "https://evil..."
  // into an on-origin path rather than honouring it as a host. This is the open-redirect
  // regression test — if the concatenation is ever replaced by something that treats
  // `next` as a full URL, this fails.
  it.each([
    ["an absolute URL", "https://evil.example/steal"],
    ["a protocol-relative host", "//evil.example/steal"],
  ])("cannot be steered to an attacker's host by %s in `next`", async (_label, next) => {
    mockExchange({ error: null });

    const response = await GET(request(`?code=valid&next=${next}`));
    const location = new URL(response.headers.get("location")!);

    // The concatenation glues `next` onto the origin string, so an absolute URL comes out
    // mangled ("https://app.example.comhttps//evil.example/steal") rather than honoured:
    // the host is never the attacker's. That mangling is what makes the missing `next`
    // allowlist safe, so it is the property pinned here — if the concatenation is ever
    // replaced by something that parses `next` as a full URL, this test fails.
    expect(location.hostname).not.toBe("evil.example");
    expect(location.hostname.startsWith("app.example.com")).toBe(true);
  });
});
