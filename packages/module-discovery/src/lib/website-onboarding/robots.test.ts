import { describe, expect, it } from "vitest";
import { isPathAllowed, parseRobotsTxt } from "./robots";

describe("parseRobotsTxt", () => {
  it("returns no restrictions for an empty file", () => {
    expect(parseRobotsTxt("")).toEqual({ disallow: [] });
  });

  it("reads the wildcard group's Disallow lines", () => {
    const text = `User-agent: *\nDisallow: /admin\nDisallow: /internal\n`;
    expect(parseRobotsTxt(text)).toEqual({ disallow: ["/admin", "/internal"] });
  });

  it("ignores comments and blank lines", () => {
    const text = `# comment\nUser-agent: *\n\n# another\nDisallow: /admin\n`;
    expect(parseRobotsTxt(text)).toEqual({ disallow: ["/admin"] });
  });

  it("prefers a group naming our own agent over the wildcard group", () => {
    const text = `User-agent: *\nDisallow: /everything\n\nUser-agent: cofounderai\nDisallow: /only-this\n`;
    expect(parseRobotsTxt(text)).toEqual({ disallow: ["/only-this"] });
  });

  it("falls back to the wildcard group when no group names our agent", () => {
    const text = `User-agent: Googlebot\nDisallow: /google-only\n\nUser-agent: *\nDisallow: /admin\n`;
    expect(parseRobotsTxt(text)).toEqual({ disallow: ["/admin"] });
  });

  it("treats an empty Disallow value as no restriction", () => {
    const text = `User-agent: *\nDisallow:\n`;
    expect(parseRobotsTxt(text)).toEqual({ disallow: [] });
  });

  it("groups multiple User-agent lines that share one rule block", () => {
    const text = `User-agent: Googlebot\nUser-agent: *\nDisallow: /admin\n`;
    expect(parseRobotsTxt(text)).toEqual({ disallow: ["/admin"] });
  });
});

describe("isPathAllowed", () => {
  it("allows everything when there are no rules", () => {
    expect(isPathAllowed({ disallow: [] }, "/anything")).toBe(true);
  });

  it("disallows a path matching a disallowed prefix", () => {
    expect(isPathAllowed({ disallow: ["/admin"] }, "/admin/settings")).toBe(false);
  });

  it("allows a path that doesn't match any disallowed prefix", () => {
    expect(isPathAllowed({ disallow: ["/admin"] }, "/about")).toBe(true);
  });

  it("disallows everything when the rule is a bare slash", () => {
    expect(isPathAllowed({ disallow: ["/"] }, "/about")).toBe(false);
  });
});
