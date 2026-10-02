import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, securityHeaders } from "./security-headers";

function directive(csp: string, name: string): string {
  return csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
}

describe("buildContentSecurityPolicy (SEC-4)", () => {
  const csp = buildContentSecurityPolicy({ isDev: false });

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
    const dev = buildContentSecurityPolicy({ isDev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(dev).not.toContain("upgrade-insecure-requests");
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
