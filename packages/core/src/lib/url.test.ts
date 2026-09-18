import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./url";

describe("normalizeUrl", () => {
  it("prepends https:// to a bare domain", () => {
    expect(normalizeUrl("acme.com")).toBe("https://acme.com");
  });

  it("leaves an absolute http(s) URL untouched", () => {
    expect(normalizeUrl("https://acme.com/pricing")).toBe("https://acme.com/pricing");
    expect(normalizeUrl("http://acme.com")).toBe("http://acme.com");
  });

  it("trims surrounding whitespace before deciding", () => {
    expect(normalizeUrl("  acme.com  ")).toBe("https://acme.com");
    expect(normalizeUrl("  https://acme.com  ")).toBe("https://acme.com");
  });

  it("handles a subdomain and a path on a bare domain", () => {
    expect(normalizeUrl("www.acme.com/about")).toBe("https://www.acme.com/about");
  });

  // Characterization: the check is `startsWith("http")`, not a scheme parse, so a
  // hostname that merely begins with "http" is treated as already-absolute. It produces
  // a scheme-less string rather than a wrong host, and every caller feeds the result to
  // `new URL()` inside a try/catch (see extractDomain), which rejects it.
  it("treats a domain starting with 'http' as already absolute", () => {
    expect(normalizeUrl("httpbin.org")).toBe("httpbin.org");
  });

  it("returns just the scheme prefix for an empty input", () => {
    expect(normalizeUrl("")).toBe("https://");
    expect(normalizeUrl("   ")).toBe("https://");
  });
});
