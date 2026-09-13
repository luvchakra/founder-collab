import { describe, expect, it } from "vitest";
import { CONFIG_RESOURCE_TYPES, diffSnapshotFields } from "./config-history";

describe("diffSnapshotFields (PLATFORM-P0-17.1 Configuration Versioning)", () => {
  it("returns no diffs for two identical snapshots", () => {
    const snapshot = { name: "Pro", price: 2999, status: "active" };
    expect(diffSnapshotFields(snapshot, { ...snapshot })).toEqual([]);
  });

  it("reports only the fields that actually changed", () => {
    const before = { name: "Pro", price: 2999, status: "active" };
    const after = { name: "Pro", price: 3999, status: "active" };
    expect(diffSnapshotFields(before, after)).toEqual([{ field: "price", before: 2999, after: 3999 }]);
  });

  it("treats a null before (a create event) as every field being new", () => {
    const after = { name: "Pro", price: 2999 };
    const diffs = diffSnapshotFields(null, after);
    expect(diffs).toContainEqual({ field: "name", before: null, after: "Pro" });
    expect(diffs).toContainEqual({ field: "price", before: null, after: 2999 });
  });

  it("treats a null after (a delete event) as every field being removed", () => {
    const before = { name: "Pro", price: 2999 };
    const diffs = diffSnapshotFields(before, null);
    expect(diffs).toContainEqual({ field: "name", before: "Pro", after: null });
    expect(diffs).toContainEqual({ field: "price", before: 2999, after: null });
  });

  it("ignores updated_at/updated_by/created_at -- they change on every edit by definition", () => {
    const before = { name: "Pro", updated_at: "2026-01-01T00:00:00Z", updated_by: "user-a", created_at: "x" };
    const after = { name: "Pro", updated_at: "2026-02-01T00:00:00Z", updated_by: "user-b", created_at: "x" };
    expect(diffSnapshotFields(before, after)).toEqual([]);
  });

  it("does a deep, not shallow, comparison for nested values (e.g. affected_modules arrays)", () => {
    const before = { affected_modules: ["discovery", "crm"] };
    const after = { affected_modules: ["discovery", "crm"] };
    expect(diffSnapshotFields(before, after)).toEqual([]);

    const changed = { affected_modules: ["discovery"] };
    expect(diffSnapshotFields(before, changed)).toEqual([
      { field: "affected_modules", before: ["discovery", "crm"], after: ["discovery"] },
    ]);
  });
});

describe("CONFIG_RESOURCE_TYPES (PLATFORM-P0-17.1/17.3)", () => {
  it("lists all eleven audited platform resource types, each with a label", () => {
    expect(CONFIG_RESOURCE_TYPES).toHaveLength(11);
    for (const t of CONFIG_RESOURCE_TYPES) {
      expect(t.label.length).toBeGreaterThan(0);
    }
  });

  it("marks exactly the four resource types 17.3 wires restore for as restorable", () => {
    const restorable = CONFIG_RESOURCE_TYPES.filter((t) => t.restorable).map((t) => t.key).sort();
    expect(restorable).toEqual(["announcement", "feature_flag", "plan", "system_policies"].sort());
  });

  it("marks the correct resource types as singleton (no instance picker needed)", () => {
    const singletons = CONFIG_RESOURCE_TYPES.filter((t) => t.singleton).map((t) => t.key).sort();
    expect(singletons).toEqual(["ai_feature_policies", "ai_provider_routing", "email_provider", "system_policies"].sort());
  });
});
