import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, securityHeaders } from "./security-headers";

function directive(csp: string, name: string): string {
  return csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
}

describe("buildContentSecurityPolicy (SEC-4)", () => {
  const csp = buildContentSecurityPolicy({ isDev: false, supabaseUrl: undefined });

  it("blocks framing, plugins and base-tag hijacking", () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("only allows scripts from this origin and Razorpay Checkout", () => {
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'unsafe-inline' https://checkout.razorpay.com");
  });

  it("lets Razorpay Checkout open its iframe and the browser reach Supabase", () => {
    expect(directive(csp, "frame-src")).toContain("https://*.razorpay.com");
    expect(directive(csp, "connect-src")).toContain("https://*.supabase.co");
    expect(directive(csp, "connect-src")).toContain("wss://*.supabase.co");
  });

  it("upgrades insecure requests in production but never allows eval", () => {
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("allows eval and skips the https upgrade only in development", () => {
    const dev = buildContentSecurityPolicy({ isDev: true, supabaseUrl: undefined });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });
});

describe("buildContentSecurityPolicy with a self-hosted Supabase (local e2e stack)", () => {
  const hosted = buildContentSecurityPolicy({ isDev: false, supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co" });
  const local = buildContentSecurityPolicy({ isDev: false, supabaseUrl: "http://127.0.0.1:54321" });

  it("leaves a hosted project's policy exactly as it was", () => {
    expect(hosted).toBe(buildContentSecurityPolicy({ isDev: false, supabaseUrl: undefined }));
  });

  it("allows the local stack's origin for API calls, images and auth redirects", () => {
    expect(directive(local, "connect-src")).toContain("http://127.0.0.1:54321 ws://127.0.0.1:54321");
    expect(directive(local, "img-src")).toContain("http://127.0.0.1:54321");
    expect(directive(local, "form-action")).toContain("http://127.0.0.1:54321");
  });

  it("doesn't upgrade requests to a plain-http stack to https", () => {
    expect(local).not.toContain("upgrade-insecure-requests");
    expect(buildContentSecurityPolicy({ isDev: false, supabaseUrl: "https://db.example.test" })).toContain("upgrade-insecure-requests");
  });
});

describe("securityHeaders (SEC-4)", () => {
  it("sends the full set, including HSTS and anti-framing for older browsers", () => {
    const keys = securityHeaders({ isDev: false }).map((h) => h.key);
    expect(keys).toEqual([
      "Content-Security-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Cross-Origin-Opener-Policy",
      "Permissions-Policy",
    ]);
  });
});
