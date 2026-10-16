import { describe, expect, it } from "vitest";
import { refuseTarget } from "../e2e/support/target";

// The E2E suite seeds accounts and writes data, so it must never reach production.
describe("refuseTarget", () => {
  const local = { supabaseUrl: "http://127.0.0.1:54321", baseUrl: "http://localhost:3100" };

  it("allows a local app and a local Supabase stack", () => {
    expect(refuseTarget(local)).toBeNull();
    expect(refuseTarget({ baseUrl: "http://localhost:3100" })).toBeNull();
  });

  it("refuses the production project and app, even with the remote override", () => {
    for (const remoteIsNotProduction of [false, true]) {
      expect(refuseTarget({ ...local, supabaseUrl: "https://jazdtomcgqjxjueedmck.supabase.co", remoteIsNotProduction })).toMatch(/production/);
      expect(refuseTarget({ ...local, baseUrl: "https://ark.wonderapps.biz", remoteIsNotProduction })).toMatch(/production/);
      expect(refuseTarget({ ...local, baseUrl: "https://acme.ark.wonderapps.biz", remoteIsNotProduction })).toMatch(/production/);
    }
  });

  it("refuses any other hosted target unless it is declared not production", () => {
    const staging = { ...local, supabaseUrl: "https://abcdefghijklmnop.supabase.co" };
    expect(refuseTarget(staging)).toMatch(/hosted target/);
    expect(refuseTarget({ ...staging, remoteIsNotProduction: true })).toBeNull();
  });

  it("refuses a malformed URL", () => {
    expect(refuseTarget({ ...local, supabaseUrl: "not a url" })).toMatch(/not a valid URL/);
  });
});
