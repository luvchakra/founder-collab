import { beforeEach, describe, expect, it, vi } from "vitest";

// PLATFORM-P1-12.7: the no-session knowledge read for the MCP draft -- licence checked
// first, every read pinned to the one business.

const h = vi.hoisted(() => ({ licensed: true, eqs: [] as [string, string, unknown][] }));
vi.mock("@cofounderai/core/db/admin", () => ({
  createAdminClient: ({ schema }: { schema: string }) =>
    schema === "core"
      ? { rpc: async () => ({ data: h.licensed, error: null }) }
      : {
          from: (table: string) => {
            const rows: Record<string, unknown[]> = {
              products: [{ id: "p1", name: "Candles" }],
              workspaces: [{ id: "w1", product_id: "p1" }],
              product_knowledge: [{ id: "k1", workspace_id: "w1", source_name: "FAQ", content: "Soy wax." }],
            };
            const b: Record<string, unknown> = {};
            b.select = () => b;
            b.order = () => b;
            b.limit = () => b;
            b.in = () => b;
            b.eq = (col: string, val: unknown) => (h.eqs.push([table, col, val]), b);
            b.then = (resolve: (v: unknown) => void) => resolve({ data: rows[table], error: null });
            return b;
          },
        },
}));

const { listOfferingKnowledgeForBusinessService } = await import("./index");

beforeEach(() => {
  h.licensed = true;
  h.eqs = [];
});

describe("listOfferingKnowledgeForBusinessService", () => {
  it("returns MODULE_NOT_LICENSED without reading anything when Discovery isn't licensed", async () => {
    h.licensed = false;
    expect(await listOfferingKnowledgeForBusinessService("biz-1")).toEqual({ ok: false, error: "MODULE_NOT_LICENSED" });
    expect(h.eqs).toEqual([]);
  });

  it("reads only the given business's offerings and their knowledge", async () => {
    const result = await listOfferingKnowledgeForBusinessService("biz-1");
    expect(h.eqs).toContainEqual(["products", "business_id", "biz-1"]);
    expect(result).toEqual({ ok: true, data: [{ id: "k1", offeringName: "Candles", sourceName: "FAQ", content: "Soy wax." }] });
  });
});
