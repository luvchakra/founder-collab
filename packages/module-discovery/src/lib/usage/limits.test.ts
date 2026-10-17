import { beforeEach, describe, expect, it, vi } from "vitest";

// AI-BYOK-NO-CAP-01: the monthly allowance protects the platform's included credit. An
// account with its own provider key runs on (and pays for) that key, so it isn't capped
// and never spends purchased credits.

const h = vi.hoisted(() => ({
  usage: { totalRuns: 0, totalCost: 0 },
  byok: null as { account_id: string } | null,
  consume: vi.fn(),
}));
vi.mock("./queries", () => ({ getWorkspaceUsage: async () => h.usage }));
vi.mock("../tenancy/queries", () => ({ getAccountIdForWorkspace: async () => "acc-1" }));
vi.mock("@cofounderai/core/billing/queries", () => ({ consumePurchasedAiCredit: h.consume }));
vi.mock("@cofounderai/core/db/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("../../db/server", () => ({
  createClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.byok, error: null }) }) }) }),
  }),
}));

const { assertWithinUsageLimit, FREE_TIER_MONTHLY_RUN_LIMIT, FREE_TIER_MONTHLY_COST_LIMIT_USD } = await import("./limits");

beforeEach(() => {
  vi.clearAllMocks();
  h.usage = { totalRuns: 0, totalCost: 0 };
  h.byok = null;
  h.consume.mockResolvedValue(false);
});

describe("assertWithinUsageLimit", () => {
  it("allows a workspace within its allowance", async () => {
    await expect(assertWithinUsageLimit("ws-1")).resolves.toBeUndefined();
  });

  it("stops a workspace over its allowance on the included credit", async () => {
    h.usage = { totalRuns: FREE_TIER_MONTHLY_RUN_LIMIT, totalCost: 0 };
    await expect(assertWithinUsageLimit("ws-1")).rejects.toThrow(/free-tier allowance/);
    h.usage = { totalRuns: 0, totalCost: FREE_TIER_MONTHLY_COST_LIMIT_USD };
    await expect(assertWithinUsageLimit("ws-1")).rejects.toThrow(/AI spend/);
  });

  it("spends a purchased credit past the allowance when the account has one", async () => {
    h.usage = { totalRuns: FREE_TIER_MONTHLY_RUN_LIMIT, totalCost: 0 };
    h.consume.mockResolvedValue(true);
    await expect(assertWithinUsageLimit("ws-1")).resolves.toBeUndefined();
    expect(h.consume).toHaveBeenCalledOnce();
  });

  it("doesn't cap an account using its own provider key, and spends none of its credits", async () => {
    h.usage = { totalRuns: FREE_TIER_MONTHLY_RUN_LIMIT * 3, totalCost: FREE_TIER_MONTHLY_COST_LIMIT_USD * 3 };
    h.byok = { account_id: "acc-1" };
    await expect(assertWithinUsageLimit("ws-1")).resolves.toBeUndefined();
    expect(h.consume).not.toHaveBeenCalled();
  });
});
