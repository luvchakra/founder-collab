import { describe, expect, it } from "vitest";
import { groupManaged, type ManagedBusiness } from "./manage-organizations";

// PLATFORM-P1-10.8: the owner's organizations, grouped by the environment link.
const m = (over: Partial<ManagedBusiness>): ManagedBusiness => ({
  id: "x",
  name: "X",
  slug: "x",
  status: "active",
  disabledByOwner: false,
  environment: "production",
  parentId: null,
  ...over,
});

describe("groupManaged", () => {
  it("puts environments under their organization, production first", () => {
    const groups = groupManaged([
      m({ id: "acme", name: "Acme" }),
      m({ id: "acme-test", name: "Acme (Test)", environment: "test", parentId: "acme" }),
      m({ id: "zed", name: "Zed" }),
    ]);
    expect(groups.map((g) => g.id)).toEqual(["acme", "zed"]);
    expect(groups[0]!.environments.map((e) => e.id)).toEqual(["acme", "acme-test"]);
  });

  it("keeps a development organization as the root", () => {
    const groups = groupManaged([m({ id: "dev", environment: "development" }), m({ id: "prod", parentId: "dev" })]);
    expect(groups.map((g) => g.id)).toEqual(["dev"]);
  });
});
