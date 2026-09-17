/**
 * The free-tier guard is the only thing bounding a workspace's AI spend (no billing
 * exists yet). Both caps are independent by design — run count catches "many cheap
 * calls", cost catches "few expensive ones" — so each is tested on its own, including
 * the boundary, since an off-by-one here is real money.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getWorkspaceUsage } = vi.hoisted(() => ({ getWorkspaceUsage: vi.fn() }));
vi.mock("./queries", () => ({ getWorkspaceUsage }));

const {
  assertWithinUsageLimit,
  FREE_TIER_MONTHLY_COST_LIMIT_USD,
  FREE_TIER_MONTHLY_RUN_LIMIT,
  UsageLimitExceededError,
} = await import("./limits");

const WORKSPACE = "w0000000-0000-0000-0000-000000000001";

function usage(totalRuns: number, totalCost: number) {
  getWorkspaceUsage.mockResolvedValue({ totalRuns, totalCost });
}

beforeEach(() => vi.clearAllMocks());

describe("assertWithinUsageLimit", () => {
  it("allows a workspace well under both caps", async () => {
    usage(1, 0.01);
    await expect(assertWithinUsageLimit(WORKSPACE)).resolves.toBeUndefined();
  });

  it("allows the last run before the run cap", async () => {
    usage(FREE_TIER_MONTHLY_RUN_LIMIT - 1, 0);
    await expect(assertWithinUsageLimit(WORKSPACE)).resolves.toBeUndefined();
  });

  it("blocks once the run cap is reached, not only once exceeded", async () => {
    usage(FREE_TIER_MONTHLY_RUN_LIMIT, 0);
    await expect(assertWithinUsageLimit(WORKSPACE)).rejects.toBeInstanceOf(UsageLimitExceededError);
  });

  it("allows the last cent before the cost cap", async () => {
    usage(0, FREE_TIER_MONTHLY_COST_LIMIT_USD - 0.01);
    await expect(assertWithinUsageLimit(WORKSPACE)).resolves.toBeUndefined();
  });

  it("blocks on cost even when the run count is low", async () => {
    usage(3, FREE_TIER_MONTHLY_COST_LIMIT_USD);
    await expect(assertWithinUsageLimit(WORKSPACE)).rejects.toBeInstanceOf(UsageLimitExceededError);
  });

  it("explains which cap was hit, so the founder sees why", async () => {
    usage(FREE_TIER_MONTHLY_RUN_LIMIT, 0);
    await expect(assertWithinUsageLimit(WORKSPACE)).rejects.toThrow(/AI runs/);

    usage(0, FREE_TIER_MONTHLY_COST_LIMIT_USD);
    await expect(assertWithinUsageLimit(WORKSPACE)).rejects.toThrow(/AI spend/);
  });

  it("names the error so callers can distinguish it from a generic failure", async () => {
    usage(FREE_TIER_MONTHLY_RUN_LIMIT, 0);
    await expect(assertWithinUsageLimit(WORKSPACE)).rejects.toMatchObject({
      name: "UsageLimitExceededError",
    });
  });

  it("checks usage for the workspace it was asked about, passing through any client", async () => {
    usage(0, 0);
    const client = { marker: "scoped-client" };

    await assertWithinUsageLimit(WORKSPACE, client as never);

    expect(getWorkspaceUsage).toHaveBeenCalledWith(WORKSPACE, client);
  });
});
