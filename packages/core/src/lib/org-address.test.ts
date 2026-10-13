import { describe, expect, it } from "vitest";
import {
  baseAppHost,
  environmentSlug,
  orgAddressRequired,
  orgInternalPath,
  orgUrl,
  orgVisiblePath,
  parseHost,
  slugProblem,
  suggestedPrefix,
} from "./org-address";

// PLATFORM-P1-10.1 / 10.3 / 10.4: address rules, host parsing and environment addresses.
describe("slugProblem", () => {
  it("accepts a valid prefix", () => {
    expect(slugProblem("acme")).toBeNull();
    expect(slugProblem("acme-co-2")).toBeNull();
    expect(slugProblem("a".repeat(32))).toBeNull();
  });
  it("refuses bad prefixes with a reason", () => {
    expect(slugProblem("ab")).toBe("Use 3 to 32 characters.");
    expect(slugProblem("a".repeat(33))).toBe("Use 3 to 32 characters.");
    expect(slugProblem("Acme")).toBe("Use lowercase letters.");
    expect(slugProblem("-acme")).toMatch(/starting and ending/);
    expect(slugProblem("acme_co")).toMatch(/letters, digits and hyphens/);
    expect(slugProblem("acme--co")).toBe("No double hyphens.");
    expect(slugProblem("www")).toBe("That address is reserved.");
    expect(slugProblem("dashboard")).toBe("That address is reserved.");
  });
});

describe("suggestedPrefix", () => {
  it("follows the name", () => {
    expect(suggestedPrefix("Acme Corp, Ltd.")).toBe("acme-corp-ltd");
    expect(suggestedPrefix("An Extremely Long Business Name That Goes On").length).toBeLessThanOrEqual(32);
    expect(suggestedPrefix("An Extremely Long Business Name That Goes On").endsWith("-")).toBe(false);
  });
  it("gives nothing usable rather than a too-short prefix", () => {
    expect(suggestedPrefix("A")).toBe("");
  });
});

describe("environmentSlug", () => {
  it("adds the environment suffix, production at the bare prefix", () => {
    expect(environmentSlug("acme", "production")).toBe("acme");
    expect(environmentSlug("acme", "development")).toBe("acme-dev");
    expect(environmentSlug("acme", "test")).toBe("acme-test");
    expect(environmentSlug("acme", "staging")).toBe("acme-staging");
  });
  it("never stacks suffixes", () => {
    expect(environmentSlug("acme-dev", "staging")).toBe("acme-staging");
    expect(environmentSlug("acme-dev", "production")).toBe("acme");
  });
});

describe("baseAppHost / orgAddressRequired", () => {
  it("normalizes the base host and is off when unset", () => {
    expect(baseAppHost({ BASE_APP_HOST: " https://Ark.WonderApps.biz:443/ " })).toBe("ark.wonderapps.biz");
    expect(baseAppHost({ BASE_APP_HOST: ".ark.wonderapps.biz" })).toBe("ark.wonderapps.biz");
    expect(baseAppHost({})).toBeNull();
  });
  it("requires both the switch and a base host", () => {
    expect(orgAddressRequired({ ORG_ADDRESS_REQUIRED: "true", BASE_APP_HOST: "ark.wonderapps.biz" })).toBe(true);
    expect(orgAddressRequired({ ORG_ADDRESS_REQUIRED: "true" })).toBe(false);
    expect(orgAddressRequired({ BASE_APP_HOST: "ark.wonderapps.biz" })).toBe(false);
  });
});

describe("parseHost", () => {
  const base = "ark.wonderapps.biz";
  it("tells the main address, an organization's address and everything else apart", () => {
    expect(parseHost("ark.wonderapps.biz", base)).toEqual({ kind: "base" });
    expect(parseHost("www.ark.wonderapps.biz", base)).toEqual({ kind: "base" });
    expect(parseHost("Acme.Ark.WonderApps.biz:443", base)).toEqual({ kind: "organization", label: "acme" });
    expect(parseHost("wonderark-git-main.vercel.app", base)).toEqual({ kind: "none" });
    expect(parseHost("acme.ark.wonderapps.biz", null)).toEqual({ kind: "none" });
  });
  it("refuses nested and malformed labels", () => {
    expect(parseHost("a.acme.ark.wonderapps.biz", base).kind).toBe("invalid");
    expect(parseHost("ab.ark.wonderapps.biz", base).kind).toBe("invalid");
    expect(parseHost("admin.ark.wonderapps.biz", base).kind).toBe("invalid");
  });
  it("works for local runs with BASE_APP_HOST=localhost", () => {
    expect(parseHost("acme.localhost:3000", "localhost")).toEqual({ kind: "organization", label: "acme" });
  });
});

describe("orgUrl", () => {
  it("builds the address, or nothing when addresses are off", () => {
    expect(orgUrl("acme", "ark.wonderapps.biz")).toBe("https://acme.ark.wonderapps.biz");
    expect(orgUrl("acme", "localhost", "http", "3000")).toBe("http://acme.localhost:3000");
    expect(orgUrl("acme", null)).toBeNull();
  });
});

describe("orgInternalPath / orgVisiblePath", () => {
  it("serves the organization's pages from the address root", () => {
    expect(orgInternalPath("/", "acme")).toBe("/acme");
    expect(orgInternalPath("/discovery/dashboard", "acme")).toBe("/acme/discovery/dashboard");
  });
  it("leaves the app's own paths alone", () => {
    for (const p of ["/login", "/auth/callback", "/api/cron/x", "/dashboard", "/platform/health", "/_next/static/x.js", "/favicon.ico", "/legal/accept"]) {
      expect(orgInternalPath(p, "acme")).toBeNull();
    }
  });
  it("redirects slug-carrying links to the visible path", () => {
    expect(orgVisiblePath("/acme", "acme")).toBe("/");
    expect(orgVisiblePath("/acme/discovery", "acme")).toBe("/discovery");
    expect(orgVisiblePath("/acme-test/discovery", "acme")).toBeNull();
    expect(orgVisiblePath("/discovery", "acme")).toBeNull();
  });
});
