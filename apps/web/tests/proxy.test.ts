/**
 * The proxy's one job of its own, ahead of the shared session handling: an auth link that
 * Supabase dropped on the site root (its redirect wasn't allowlisted, so it substituted
 * the Site URL) is forwarded to the one route that can consume it. Everything else is
 * handed straight to updateSession(), which has its own tests in packages/core.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ updateSession: vi.fn() }));
vi.mock("@cofounderai/core/db/middleware", () => ({ updateSession: h.updateSession }));

const { proxy } = await import("../proxy");

const CODE = "4a4bd76b-2c3f-4f52-9c1d-1f0f7b4a2e11";

function request(path: string) {
  return new NextRequest(`https://app.example.com${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.updateSession.mockResolvedValue(new Response(null, { status: 200 }));
});

describe("proxy — auth links dropped on the site root", () => {
  it("forwards a PKCE code to the callback, keeping its destination", async () => {
    const response = await proxy(request(`/?code=${CODE}&next=/reset-password`));

    expect(response.headers.get("location")).toBe(
      `https://app.example.com/auth/callback?code=${CODE}&next=%2Freset-password`,
    );
    expect(h.updateSession).not.toHaveBeenCalled();
  });

  it("forwards a token-hash link the same way", async () => {
    const response = await proxy(request("/?token_hash=abc&type=recovery"));

    expect(new URL(response.headers.get("location")!).pathname).toBe("/auth/callback");
  });

  it("forwards Supabase's own rejection so the reason reaches a page that shows it", async () => {
    const response = await proxy(request("/?error=access_denied&error_description=Email+link+is+invalid&type=recovery"));

    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/auth/callback");
    expect(location.searchParams.get("error_description")).toBe("Email link is invalid");
  });

  it("leaves an ordinary marketing ?code= alone", async () => {
    await proxy(request("/?code=SUMMER20"));

    expect(h.updateSession).toHaveBeenCalledOnce();
  });

  it("only rescues links on the site root, where Supabase drops them", async () => {
    await proxy(request(`/login?code=${CODE}`));

    expect(h.updateSession).toHaveBeenCalledOnce();
  });
});

describe("proxy — everything else", () => {
  it("hands the request to the shared session handling", async () => {
    const req = request("/dashboard");

    const response = await proxy(req);

    expect(h.updateSession).toHaveBeenCalledWith(req);
    expect(response.status).toBe(200);
  });
});
