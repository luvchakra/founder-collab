/**
 * The proxy's per-request work, with the Supabase client faked out. Two things this pins
 * that the pure-function tests in middleware.test.ts cannot: the session is verified with
 * getClaims() -- a local signature check -- and never with getUser(), which is a round
 * trip to the Auth server on every request; and a signed-in visitor to the marketing page
 * is redirected here, which is what lets that page prerender as static.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getUser: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: h.createServerClient }));

const { updateSession } = await import("./middleware");

function request(path: string) {
  return new NextRequest(`https://app.example.com${path}`);
}

function signedIn(claims: Record<string, unknown> | null) {
  h.getClaims.mockResolvedValue({ data: claims ? { claims } : null, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable";
  h.createServerClient.mockReturnValue({
    auth: { getClaims: h.getClaims, getUser: h.getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  });
});

describe("updateSession — how the session is verified", () => {
  it("verifies the token locally with getClaims and never calls the Auth server", async () => {
    signedIn({ sub: "user-1" });

    await updateSession(request("/dashboard"));

    expect(h.getClaims).toHaveBeenCalledOnce();
    expect(h.getUser).not.toHaveBeenCalled();
  });
});

describe("updateSession — where a visitor is sent", () => {
  it("sends a signed-out visitor on a protected route to the login page", async () => {
    signedIn(null);

    const response = await updateSession(request("/dashboard"));

    expect(response.headers.get("location")).toBe("https://app.example.com/login");
  });

  it("lets a signed-out visitor see the marketing page", async () => {
    signedIn(null);

    const response = await updateSession(request("/"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  // Decided here rather than on the page so "/" has nothing to read at request time
  // and can be served as a static page from the CDN.
  it("sends a signed-in visitor on the marketing page to their dashboard", async () => {
    signedIn({ sub: "user-1" });

    const response = await updateSession(request("/"));

    expect(response.headers.get("location")).toBe("https://app.example.com/dashboard");
  });

  it.each(["/login", "/signup"])("sends a signed-in visitor on %s to their dashboard", async (path) => {
    signedIn({ sub: "user-1" });

    const response = await updateSession(request(path));

    expect(response.headers.get("location")).toBe("https://app.example.com/dashboard");
  });

  // A signed-in user changing their password still has to be able to finish the reset.
  it("leaves a signed-in visitor on the reset-password page alone", async () => {
    signedIn({ sub: "user-1" });

    const response = await updateSession(request("/reset-password"));

    expect(response.headers.get("location")).toBeNull();
  });
});

describe("updateSession — the help guides are signed-in only", () => {
  it.each(["/help", "/help/finance"])("sends a signed-out visitor on %s to sign-in, remembering the page", async (path) => {
    signedIn(null);

    const response = await updateSession(request(path));

    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe(path);
  });

  it("lets a signed-in visitor read the help guides", async () => {
    signedIn({ sub: "user-1" });

    const response = await updateSession(request("/help/finance"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("sends a signed-in visitor on sign-in straight back to the help page they asked for", async () => {
    signedIn({ sub: "user-1" });

    const response = await updateSession(request("/login?next=%2Fhelp%2Ffinance"));

    expect(response.headers.get("location")).toBe("https://app.example.com/help/finance");
  });

  it("never follows a `next` that isn't a help page", async () => {
    signedIn({ sub: "user-1" });

    for (const next of ["//evil.example", "https://evil.example/help", "/dashboard/settings", "/help/../platform"]) {
      const response = await updateSession(request(`/login?next=${encodeURIComponent(next)}`));
      const location = new URL(response.headers.get("location")!);
      expect(`${location.origin}${location.pathname}`, next).toBe("https://app.example.com/dashboard");
    }
  });

  it("keeps the plain sign-in redirect for other protected pages", async () => {
    signedIn(null);

    const response = await updateSession(request("/dashboard"));

    expect(response.headers.get("location")).toBe("https://app.example.com/login");
  });
});
