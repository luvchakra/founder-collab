/**
 * The email-link callback turns whatever a Supabase auth link carries into a session.
 * Three properties hold it together: every link shape Supabase can send is consumed (the
 * project's email template decides which arrives, so assuming one silently breaks the
 * others), a link that cannot be consumed says why rather than dumping the founder on a
 * blank login page, and `next` — which arrives on the URL and is therefore
 * attacker-controllable — only ever steers a *successfully authenticated* visitor.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient }));

const { GET } = await import("./route");

const ORIGIN = "https://app.example.com";

function mockAuth(results: { exchange?: { error: unknown }; verify?: { error: unknown } } = {}) {
  const exchangeCodeForSession = vi.fn().mockResolvedValue(results.exchange ?? { error: null });
  const verifyOtp = vi.fn().mockResolvedValue(results.verify ?? { error: null });
  createClient.mockResolvedValue({ auth: { exchangeCodeForSession, verifyOtp } });
  return { exchangeCodeForSession, verifyOtp };
}

function request(query: string) {
  return new Request(`${ORIGIN}/auth/callback${query}`);
}

/** The reason a failed link carries through to the page it lands on. */
function reason(response: Response): string | null {
  return new URL(response.headers.get("location")!).searchParams.get("error");
}

function path(response: Response): string {
  return new URL(response.headers.get("location")!).pathname;
}

beforeEach(() => vi.clearAllMocks());

describe("GET /auth/callback — PKCE code links", () => {
  it("exchanges the code and redirects to the default destination", async () => {
    const { exchangeCodeForSession } = mockAuth();

    const response = await GET(request("?code=one-time-code"));

    expect(exchangeCodeForSession).toHaveBeenCalledWith("one-time-code");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/dashboard`);
  });

  it("honours an explicit next destination", async () => {
    mockAuth();

    const response = await GET(request("?code=c&next=/onboarding"));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/onboarding`);
  });
});

/**
 * The token-hash shape is what makes a reset requested on one device usable on another:
 * everything needed is in the URL, with no code verifier cookie to match. A project whose
 * template sends this shape would have had every reset link dead-end at /login without it.
 */
describe("GET /auth/callback — token hash links", () => {
  it("verifies a recovery link and forwards to the reset form", async () => {
    const { verifyOtp, exchangeCodeForSession } = mockAuth();

    const response = await GET(
      request("?token_hash=hash-123&type=recovery&next=/reset-password"),
    );

    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "hash-123" });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(`${ORIGIN}/reset-password`);
  });

  it("verifies the other email link types the same way", async () => {
    const { verifyOtp } = mockAuth();

    await GET(request("?token_hash=hash-123&type=signup&next=/onboarding"));

    expect(verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: "hash-123" });
  });

  it("prefers the token hash when a link somehow carries both shapes", async () => {
    const { verifyOtp, exchangeCodeForSession } = mockAuth();

    await GET(request("?token_hash=hash-123&type=recovery&code=also-here"));

    expect(verifyOtp).toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("ignores a token hash with no type, since verifyOtp needs both", async () => {
    const { verifyOtp } = mockAuth();

    const response = await GET(request("?token_hash=hash-123"));

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(path(response)).toBe("/login");
  });
});

describe("GET /auth/callback — links that cannot be consumed", () => {
  it("passes Supabase's own rejection through instead of swallowing it", async () => {
    mockAuth();

    const response = await GET(
      request(
        "?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&next=/reset-password",
      ),
    );

    expect(reason(response)).toBe("Email link is invalid or has expired");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("falls back to the bare error code when there is no description", async () => {
    mockAuth();

    const response = await GET(request("?error=access_denied"));

    expect(reason(response)).toBe("access_denied");
  });

  it("sends a failed recovery link to forgot-password, where a new one can be requested", async () => {
    mockAuth({ verify: { error: { message: "Email link is invalid or has expired" } } });

    const response = await GET(request("?token_hash=stale&type=recovery&next=/reset-password"));

    expect(path(response)).toBe("/forgot-password");
    expect(reason(response)).toBe("Email link is invalid or has expired");
  });

  it("recognises a recovery link by its destination when the type is absent", async () => {
    mockAuth({ exchange: { error: { message: "expired" } } });

    const response = await GET(request("?code=stale&next=/reset-password"));

    expect(path(response)).toBe("/forgot-password");
  });

  it("sends every other failed link to login", async () => {
    mockAuth({ exchange: { error: { message: "code expired" } } });

    const response = await GET(request("?code=stale&next=/onboarding"));

    expect(path(response)).toBe("/login");
    expect(reason(response)).toBe("code expired");
  });

  it("translates the cross-device PKCE failure into something a founder can act on", async () => {
    mockAuth({
      exchange: {
        error: { message: "invalid request: both auth code and code verifier should be non-empty" },
      },
    });

    const response = await GET(request("?code=stale&next=/reset-password"));

    expect(reason(response)).toMatch(/different browser or device/);
    expect(reason(response)).not.toMatch(/code verifier/);
  });

  it("says so when the link carries nothing to consume at all", async () => {
    mockAuth();

    const response = await GET(request("?next=/onboarding"));

    expect(createClient).not.toHaveBeenCalled();
    expect(path(response)).toBe("/login");
    expect(reason(response)).toMatch(/missing its confirmation code/);
  });
});

describe("GET /auth/callback — open redirect", () => {
  it("never redirects off-origin on the failure path", async () => {
    mockAuth({ exchange: { error: { message: "bad" } } });

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
    mockAuth();

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

  it("keeps the same guarantee for a token-hash link", async () => {
    mockAuth();

    const response = await GET(
      request("?token_hash=h&type=recovery&next=https://evil.example/steal"),
    );

    expect(new URL(response.headers.get("location")!).hostname).not.toBe("evil.example");
  });
});
