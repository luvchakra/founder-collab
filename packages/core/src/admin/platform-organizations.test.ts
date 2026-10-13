import { describe, expect, it } from "vitest";
import { groupOrganizations, isTestOrganization, type ConsoleBusiness } from "./platform-organizations";

// PLATFORM-P1-10.10: organizations are grouped by the link, never by environment rank.
const b = (over: Partial<ConsoleBusiness>): ConsoleBusiness => ({
  id: "x",
  name: "X",
  slug: "x",
  status: "active",
  environment: "production",
  parentId: null,
  plan: "free",
  notes: null,
  disabledByOwner: false,
  suspensionReason: null,
  createdAt: "2026-10-13T00:00:00Z",
  ...over,
});

describe("groupOrganizations", () => {
  it("puts environments under the organization they link to, production first", () => {
    const groups = groupOrganizations([
      b({ id: "acme", name: "Acme", slug: "acme" }),
      b({ id: "acme-staging", name: "Acme (Staging)", environment: "staging", parentId: "acme" }),
      b({ id: "acme-test", name: "Acme (Test)", environment: "test", parentId: "acme" }),
      b({ id: "bob", name: "Bob" }),
    ]);
    expect(groups.map((g) => g.id)).toEqual(["acme", "bob"]);
    expect(groups[0]!.environments.map((e) => e.environment)).toEqual(["production", "test", "staging"]);
  });

  it("keeps a development organization as the root of its added environments (WonderID's rank bug)", () => {
    const groups = groupOrganizations([
      b({ id: "planet", name: "Planet", environment: "development" }),
      b({ id: "planet-prod", name: "Planet (Production)", environment: "production", parentId: "planet" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.id).toBe("planet");
    expect(groups[0]!.environments.map((e) => e.id)).toEqual(["planet-prod", "planet"]);
  });

  it("shows an environment whose organization is missing as its own organization", () => {
    expect(groupOrganizations([b({ id: "orphan", parentId: "gone", environment: "test" })]).map((g) => g.id)).toEqual(["orphan"]);
  });
});

describe("isTestOrganization", () => {
  it("spots test and fixture organizations", () => {
    expect(isTestOrganization("e2e-acme", ["a@b.com"])).toBe(true);
    expect(isTestOrganization("acme", ["qa@example.com", "x@example.test"])).toBe(true);
    expect(isTestOrganization("acme", ["ann@acme.in"])).toBe(false);
    expect(isTestOrganization("acme", [])).toBe(false);
  });
});
