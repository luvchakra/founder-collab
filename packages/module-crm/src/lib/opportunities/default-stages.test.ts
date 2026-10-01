import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * E2E-DEF-012 regression: ensureDefaultStages() is called on a business's first visit to
 * Opportunities. Two first visits at once both find no stages and both insert; the loser
 * gets 23505 on (business_id, key). That used to crash the page.
 */
const state = vi.hoisted(() => ({
  selects: [] as unknown[][],
  insertError: null as { code: string; message: string } | null,
}));

vi.mock("../../db/server", () => ({
  createClient: async () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        order: async () => ({ data: state.selects.shift() ?? [], error: null }),
        insert: () => ({
          select: async () => (state.insertError ? { data: null, error: state.insertError } : { data: [{ key: "new" }], error: null }),
        }),
      };
      return query;
    },
  }),
}));
// Unrelated imports of mutations.ts that would otherwise reach real infrastructure.
vi.mock("@cofounderai/core/audit/mutations", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ requirePermission: vi.fn() }));
vi.mock("@cofounderai/module-inventory/contract/index", () => ({ createFulfillmentRequest: vi.fn() }));
vi.mock("@cofounderai/module-discovery/contract/index", () => ({ getProspectSummaryForParty: vi.fn() }));
vi.mock("@cofounderai/core/addresses/queries", () => ({ getPrimaryAddress: vi.fn() }));
vi.mock("../../events/publish", () => ({ publishCrmEvent: vi.fn() }));

const { ensureDefaultStages } = await import("./mutations");

describe("ensureDefaultStages (E2E-DEF-012)", () => {
  beforeEach(() => {
    state.selects = [];
    state.insertError = null;
  });

  it("returns existing stages untouched", async () => {
    state.selects = [[{ key: "qualified" }]];
    expect(await ensureDefaultStages("b1")).toEqual([{ key: "qualified" }]);
  });

  it("seeds defaults on first use", async () => {
    state.selects = [[]];
    expect(await ensureDefaultStages("b1")).toEqual([{ key: "new" }]);
  });

  it("losing a concurrent first-use race returns the winner's stages instead of throwing", async () => {
    state.selects = [[], [{ key: "new" }, { key: "won" }]];
    state.insertError = { code: "23505", message: "duplicate key value violates unique constraint" };
    expect(await ensureDefaultStages("b1")).toEqual([{ key: "new" }, { key: "won" }]);
  });

  it("still surfaces any other insert failure", async () => {
    state.selects = [[]];
    state.insertError = { code: "42501", message: "permission denied" };
    await expect(ensureDefaultStages("b1")).rejects.toMatchObject({ code: "42501" });
  });
});
