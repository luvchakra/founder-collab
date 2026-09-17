import { describe, expect, it } from "vitest";
import { planProvisioning } from "./provisioning";
import { DEFAULT_ACCOUNT_ROLES, DEFAULT_CHART_OF_ACCOUNTS } from "./chart-of-accounts";
import type { AccountSeed } from "./types";

const flat = (plan: ReturnType<typeof planProvisioning>) => plan.batches.flat();

describe("provisioning a fresh business", () => {
  const plan = planProvisioning([], []);

  it("creates the whole default chart", () => {
    expect(flat(plan)).toHaveLength(DEFAULT_CHART_OF_ACCOUNTS.length);
  });

  it("creates every parent in an earlier batch than its children", () => {
    const batchOf = new Map<string, number>();
    plan.batches.forEach((batch, i) => batch.forEach((seed) => batchOf.set(seed.accountNumber, i)));
    for (const seed of flat(plan)) {
      if (seed.parent !== null) {
        expect(batchOf.get(seed.accountNumber)!, seed.accountNumber).toBeGreaterThan(
          batchOf.get(seed.parent)!,
        );
      }
    }
  });

  it("points every posting role at its default account", () => {
    expect(plan.roleMappings).toHaveLength(Object.keys(DEFAULT_ACCOUNT_ROLES).length);
  });
});

describe("running it again", () => {
  const all = DEFAULT_CHART_OF_ACCOUNTS.map((a) => a.accountNumber);

  it("creates nothing when the business already has the whole chart", () => {
    const plan = planProvisioning(all, Object.keys(DEFAULT_ACCOUNT_ROLES));
    expect(flat(plan)).toEqual([]);
    expect(plan.roleMappings).toEqual([]);
  });

  // A release that adds an account to the default chart must reach businesses that were
  // set up before it, without touching anything they have since renamed.
  it("creates only what is missing", () => {
    const plan = planProvisioning(
      all.filter((n) => n !== "6500"),
      Object.keys(DEFAULT_ACCOUNT_ROLES),
    );
    expect(flat(plan).map((s) => s.accountNumber)).toEqual(["6500"]);
  });

  // The business re-pointed `bank` at its second bank account; re-running must not drag
  // it back to 1100.
  it("leaves a role the business has already re-pointed alone", () => {
    const plan = planProvisioning(all, ["bank"]);
    expect(plan.roleMappings.map((m) => m.role)).not.toContain("bank");
    expect(plan.roleMappings.map((m) => m.role)).toContain("cash");
  });

  it("maps a role that has no mapping yet even when every account already exists", () => {
    const plan = planProvisioning(all, []);
    expect(flat(plan)).toEqual([]);
    expect(plan.roleMappings).toHaveLength(Object.keys(DEFAULT_ACCOUNT_ROLES).length);
  });
});

describe("a chart that is deeper than two levels", () => {
  const deep: AccountSeed[] = [
    { accountNumber: "1", name: "one", type: "asset", parent: null, isSystem: false },
    { accountNumber: "2", name: "two", type: "asset", parent: "1", isSystem: false },
    { accountNumber: "3", name: "three", type: "asset", parent: "2", isSystem: false },
    { accountNumber: "4", name: "four", type: "asset", parent: "3", isSystem: false },
  ];

  it("batches by depth rather than assuming two levels", () => {
    const plan = planProvisioning([], [], deep, {});
    expect(plan.batches.map((b) => b.map((s) => s.accountNumber))).toEqual([["1"], ["2"], ["3"], ["4"]]);
  });

  it("puts a child straight in the first batch when its parent is already in the database", () => {
    const plan = planProvisioning(["1", "2"], [], deep, {});
    expect(plan.batches[0]!.map((s) => s.accountNumber)).toEqual(["3"]);
  });

  // A parent that exists in neither the chart nor the database would otherwise loop
  // forever looking for a batch to belong to.
  it("terminates on a seed whose parent is not in the chart at all", () => {
    const broken: AccountSeed[] = [
      { accountNumber: "9", name: "orphan", type: "asset", parent: "nowhere", isSystem: false },
    ];
    expect(flat(planProvisioning([], [], broken, {})).map((s) => s.accountNumber)).toEqual(["9"]);
  });
});
