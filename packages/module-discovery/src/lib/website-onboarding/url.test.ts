import { describe, expect, it } from "vitest";
import { normalizeWebsiteUrl } from "./url";

describe("normalizeWebsiteUrl", () => {
  it("rejects an empty address", () => {
    const result = normalizeWebsiteUrl("   ");
    expect(result).toEqual({ ok: false, error: "A website address is required." });
  });

  it("defaults a bare domain to https://", () => {
    const result = normalizeWebsiteUrl("example.com");
    expect(result).toEqual({ ok: true, url: "https://example.com" });
  });

  it("keeps an explicit http:// scheme as given", () => {
    const result = normalizeWebsiteUrl("http://example.com");
    expect(result).toEqual({ ok: true, url: "http://example.com" });
  });

  it("lowercases the hostname", () => {
    const result = normalizeWebsiteUrl("https://Example.COM");
    expect(result).toEqual({ ok: true, url: "https://example.com" });
  });

  it("strips a trailing slash on a bare hostname but keeps a real path", () => {
    expect(normalizeWebsiteUrl("https://example.com/")).toEqual({ ok: true, url: "https://example.com" });
    expect(normalizeWebsiteUrl("https://example.com/about/")).toEqual({ ok: true, url: "https://example.com/about" });
  });

  it("drops query strings and fragments", () => {
    const result = normalizeWebsiteUrl("https://example.com/?utm_source=x#top");
    expect(result).toEqual({ ok: true, url: "https://example.com" });
  });

  it("rejects a hostname with no dot", () => {
    const result = normalizeWebsiteUrl("https://localhost");
    expect(result).toEqual({ ok: false, error: "We couldn't recognize this website address." });
  });

  it("rejects a non-http(s) scheme", () => {
    const result = normalizeWebsiteUrl("ftp://example.com");
    expect(result).toEqual({ ok: false, error: "We couldn't recognize this website address." });
  });

  it("rejects a string that isn't a URL at all", () => {
    const result = normalizeWebsiteUrl("not a website");
    expect(result.ok).toBe(false);
  });
});
