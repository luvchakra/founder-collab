/**
 * PLATFORM-P1-08.2 ("Feature Rollout") / PLATFORM-P1-08.3 ("Rollback Flag"). The database
 * side (authorization, rollback restoring state, SQL/TS bucket agreement, fail-closed
 * evaluation) is covered by scripts/test-platform-feature-rollout-rls.mjs; this covers the
 * TypeScript evaluation, validation, fail-closed lookup and the superadmin gate.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, createAdminClient, requireSuperadmin } = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  requireSuperadmin: vi.fn(),
}));
vi.mock("../db/server", () => ({ createClient }));
vi.mock("../db/admin", () => ({ createAdminClient }));
vi.mock("../rbac/platform-admin", () => ({ requireSuperadmin }));

const {
  isBusinessInRollout,
  isFeatureEnabledForBusiness,
  rollbackFeatureFlag,
  rolloutBucket,
  setFeatureFlagRollout,
  setFeatureFlagRolloutSchema,
} = await import("./platform-feature-rollout");
const { nextRolloutStage, rolloutFromSnapshot, rolloutSummary, isLaterStage } = await import(
  "./platform-feature-rollout-rules"
);

const FLAG = "11111111-1111-4111-8111-111111111111";
const ids = Array.from({ length: 200 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);

beforeEach(() => {
  vi.clearAllMocks();
  requireSuperadmin.mockResolvedValue(undefined);
});

describe("rolloutBucket", () => {
  it("is deterministic and in 0-99", () => {
    for (const id of ids) {
      const b = rolloutBucket("new_editor", id);
      expect(b).toBe(rolloutBucket("new_editor", id));
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
    }
  });

  it("matches values computed by SQL platform.feature_rollout_bucket()", () => {
    expect(rolloutBucket("new_editor", "00000000-0000-0000-0000-000000000001")).toBe(32);
    expect(rolloutBucket("ai_research", "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b")).toBe(59);
    expect(rolloutBucket("new_editor", "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b")).toBe(57);
  });

  it("buckets different flags independently", () => {
    const a = ids.map((id) => rolloutBucket("flag_a", id));
    const b = ids.map((id) => rolloutBucket("flag_b", id));
    expect(a).not.toEqual(b);
  });
});

describe("isBusinessInRollout", () => {
  const base = { percentage: 0, businessIds: [] as string[], planKeys: [] as string[] };
  const biz = (id: string, planKey: string | null = "free") => ({ id, planKey });

  it("All Customers includes everyone", () => {
    expect(ids.every((id) => isBusinessInRollout("f", { ...base, stage: "all" }, biz(id)))).toBe(true);
  });

  it("Internal includes only the named businesses and ignores a percentage", () => {
    const r = { ...base, stage: "internal" as const, percentage: 100, businessIds: [ids[3]!] };
    expect(ids.filter((id) => isBusinessInRollout("f", r, biz(id)))).toEqual([ids[3]!]);
  });

  it("the allow-list wins at every stage, whatever the bucket", () => {
    for (const stage of ["internal", "pilot", "selected_plans"] as const) {
      expect(isBusinessInRollout("f", { ...base, stage, businessIds: [ids[7]!] }, biz(ids[7]!, null))).toBe(true);
    }
  });

  it("Pilot percentage boundary is strict: bucket < percentage", () => {
    const id = ids.find((x) => rolloutBucket("f", x) > 0 && rolloutBucket("f", x) < 99)!;
    const bucket = rolloutBucket("f", id);
    expect(isBusinessInRollout("f", { ...base, stage: "pilot", percentage: bucket }, biz(id))).toBe(false);
    expect(isBusinessInRollout("f", { ...base, stage: "pilot", percentage: bucket + 1 }, biz(id))).toBe(true);
  });

  it("Pilot at 0% is nobody and at 100% is everybody", () => {
    expect(ids.some((id) => isBusinessInRollout("f", { ...base, stage: "pilot", percentage: 0 }, biz(id)))).toBe(false);
    expect(ids.every((id) => isBusinessInRollout("f", { ...base, stage: "pilot", percentage: 100 }, biz(id)))).toBe(true);
  });

  it("raising the percentage never removes a business (stable in/out)", () => {
    let previous = new Set<string>();
    for (let pct = 0; pct <= 100; pct += 5) {
      const now = new Set(ids.filter((id) => isBusinessInRollout("f", { ...base, stage: "pilot", percentage: pct }, biz(id))));
      for (const id of previous) expect(now.has(id)).toBe(true);
      previous = now;
    }
    expect(previous.size).toBe(ids.length);
  });

  it("Selected Plans adds businesses on the chosen plans, and only there", () => {
    const r = { ...base, stage: "selected_plans" as const, planKeys: ["pro"] };
    expect(isBusinessInRollout("f", r, biz(ids[0]!, "pro"))).toBe(true);
    expect(isBusinessInRollout("f", r, biz(ids[0]!, "free"))).toBe(false);
    expect(isBusinessInRollout("f", r, biz(ids[0]!, null))).toBe(false);
    // Plans don't count at Pilot.
    expect(isBusinessInRollout("f", { ...r, stage: "pilot" }, biz(ids[0]!, "pro"))).toBe(false);
  });
});

describe("rollout rules", () => {
  it("advances Internal -> Pilot -> Selected Plans -> All Customers", () => {
    expect(nextRolloutStage("internal")).toBe("pilot");
    expect(nextRolloutStage("pilot")).toBe("selected_plans");
    expect(nextRolloutStage("selected_plans")).toBe("all");
    expect(nextRolloutStage("all")).toBeNull();
    expect(isLaterStage("pilot", "internal")).toBe(true);
    expect(isLaterStage("internal", "pilot")).toBe(false);
  });

  it("summarises who a rollout reaches", () => {
    expect(rolloutSummary({ stage: "all", percentage: 0, businessIds: [], planKeys: [] })).toBe("All Customers");
    expect(rolloutSummary({ stage: "pilot", percentage: 10, businessIds: ["a", "b"], planKeys: [] })).toBe(
      "Pilot -- 2 businesses + 10%",
    );
    expect(rolloutSummary({ stage: "internal", percentage: 0, businessIds: [], planKeys: [] })).toBe(
      "Internal -- nobody yet",
    );
  });

  it("reads a saved snapshot back, and rejects a malformed one", () => {
    expect(
      rolloutFromSnapshot({ rollout_stage: "pilot", rollout_percentage: 20, rollout_business_ids: ["x"], rollout_plan_keys: [] }),
    ).toEqual({ stage: "pilot", percentage: 20, businessIds: ["x"], planKeys: [] });
    expect(rolloutFromSnapshot(null)).toBeNull();
    expect(rolloutFromSnapshot({ rollout_stage: "everyone" })).toBeNull();
  });
});

describe("setFeatureFlagRolloutSchema", () => {
  const valid = { id: FLAG, stage: "pilot" as const, percentage: "10", businessSlugs: "", planKeys: [], reason: "pilot" };

  it("requires a reason", () => {
    expect(setFeatureFlagRolloutSchema.safeParse({ ...valid, reason: "  " }).success).toBe(false);
  });

  it("rejects a percentage outside 0-100 or not whole", () => {
    expect(setFeatureFlagRolloutSchema.safeParse({ ...valid, percentage: "101" }).success).toBe(false);
    expect(setFeatureFlagRolloutSchema.safeParse({ ...valid, percentage: "-1" }).success).toBe(false);
    expect(setFeatureFlagRolloutSchema.safeParse({ ...valid, percentage: "2.5" }).success).toBe(false);
  });

  it("splits and de-duplicates business slugs", () => {
    const r = setFeatureFlagRolloutSchema.safeParse({ ...valid, businessSlugs: "acme\nBeta, acme  gamma" });
    expect(r.success && r.data.businessSlugs).toEqual(["acme", "beta", "gamma"]);
  });

  it("normalises Internal to no percentage and no plans", () => {
    const r = setFeatureFlagRolloutSchema.safeParse({ ...valid, stage: "internal", percentage: "50", planKeys: ["pro"] });
    expect(r.success && [r.data.percentage, r.data.planKeys]).toEqual([0, []]);
  });

  it("Selected Plans needs at least one plan", () => {
    expect(setFeatureFlagRolloutSchema.safeParse({ ...valid, stage: "selected_plans" }).success).toBe(false);
    expect(setFeatureFlagRolloutSchema.safeParse({ ...valid, stage: "selected_plans", planKeys: ["pro"] }).success).toBe(true);
  });
});

describe("isFeatureEnabledForBusiness fails closed", () => {
  function clientReturning(result: { data: unknown; error: unknown } | Error) {
    const rpc = vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    });
    createClient.mockResolvedValue({ rpc });
    return rpc;
  }

  it("is true only for a literal true from the database", async () => {
    const rpc = clientReturning({ data: true, error: null });
    await expect(isFeatureEnabledForBusiness("new_editor", ids[0]!)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("is_feature_enabled_for_business", {
      p_feature_key: "new_editor",
      p_business_id: ids[0]!,
    });
  });

  it("is false on false, null, an error, a non-boolean or a thrown lookup", async () => {
    clientReturning({ data: false, error: null });
    await expect(isFeatureEnabledForBusiness("f", ids[0]!)).resolves.toBe(false);
    clientReturning({ data: null, error: null });
    await expect(isFeatureEnabledForBusiness("f", ids[0]!)).resolves.toBe(false);
    clientReturning({ data: true, error: { message: "boom" } });
    await expect(isFeatureEnabledForBusiness("f", ids[0]!)).resolves.toBe(false);
    clientReturning({ data: "true", error: null });
    await expect(isFeatureEnabledForBusiness("f", ids[0]!)).resolves.toBe(false);
    clientReturning(new Error("network down"));
    await expect(isFeatureEnabledForBusiness("f", ids[0]!)).resolves.toBe(false);
    createClient.mockRejectedValue(new Error("no cookies"));
    await expect(isFeatureEnabledForBusiness("f", ids[0]!)).resolves.toBe(false);
  });
});

describe("only platform superadmins can change a rollout or roll back", () => {
  it("setFeatureFlagRollout stops before any database call when the gate refuses", async () => {
    requireSuperadmin.mockRejectedValue(new Error("Forbidden"));
    await expect(
      setFeatureFlagRollout({ id: FLAG, stage: "all", percentage: 0, businessSlugs: "", planKeys: [], reason: "x" }),
    ).rejects.toThrow("Forbidden");
    expect(createClient).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("rollbackFeatureFlag stops before any database call when the gate refuses", async () => {
    requireSuperadmin.mockRejectedValue(new Error("Forbidden"));
    await expect(rollbackFeatureFlag({ id: FLAG, reason: "x" })).rejects.toThrow("Forbidden");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rollbackFeatureFlag requires a reason and reports the database's refusal", async () => {
    await expect(rollbackFeatureFlag({ id: FLAG, reason: " " })).resolves.toMatchObject({ ok: false });
    createClient.mockResolvedValue({ rpc: vi.fn(async () => ({ data: null, error: { message: "Nothing to roll back" } })) });
    await expect(rollbackFeatureFlag({ id: FLAG, reason: "bad deploy" })).resolves.toEqual({
      ok: false,
      error: "Nothing to roll back",
    });
  });

  it("setFeatureFlagRollout reports an unknown business slug and changes nothing", async () => {
    const inFn = vi.fn(async () => ({ data: [{ business_id: ids[0]!, slug: "acme" }], error: null }));
    createAdminClient.mockReturnValue({ from: () => ({ select: () => ({ in: inFn }) }) });
    const result = await setFeatureFlagRollout({
      id: FLAG,
      stage: "internal",
      percentage: 0,
      businessSlugs: "acme\nghost",
      planKeys: [],
      reason: "dogfood",
    });
    expect(result).toMatchObject({ ok: false, fieldErrors: { businessSlugs: 'No business with slug "ghost".' } });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("setFeatureFlagRollout sends resolved ids to the audited RPC", async () => {
    createAdminClient.mockReturnValue({
      from: () => ({ select: () => ({ in: async () => ({ data: [{ business_id: ids[0]!, slug: "acme" }], error: null }) }) }),
    });
    const rpc = vi.fn(async () => ({ data: {}, error: null }));
    createClient.mockResolvedValue({ rpc });
    await expect(
      setFeatureFlagRollout({ id: FLAG, stage: "pilot", percentage: "15", businessSlugs: "ACME", planKeys: ["pro"], reason: "pilot" }),
    ).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("set_feature_flag_rollout", {
      p_id: FLAG,
      p_stage: "pilot",
      p_percentage: 15,
      p_business_ids: [ids[0]!],
      p_plan_keys: [],
      p_reason: "pilot",
    });
  });
});
