/**
 * Layer-3 (defense-in-depth) guard tests. RLS remains authoritative — these prove the
 * guard asks the database the right question and turns a "no" into a catchable error
 * rather than letting an unchecked write reach Postgres and surface a raw policy
 * violation to the UI.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { requirePermission } = await import("./require-permission");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";

function mockRpc(result: { data: unknown; error: unknown }) {
  const supabase = createFakeSupabase({ rpc: () => result });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("requirePermission", () => {
  it("resolves when the database says the caller holds the permission", async () => {
    mockRpc({ data: true, error: null });
    await expect(requirePermission(BUSINESS, "inventory.write")).resolves.toBeUndefined();
  });

  it("asks core.has_permission for this business and key", async () => {
    const supabase = mockRpc({ data: true, error: null });

    await requirePermission(BUSINESS, "inventory.write");

    expect(supabase.rpcs("has_permission")[0]!.args).toEqual({
      p_business_id: BUSINESS,
      p_key: "inventory.write",
    });
  });

  it("runs as the signed-in user against core — never the RLS-bypassing admin client", async () => {
    mockRpc({ data: true, error: null });

    await requirePermission(BUSINESS, "inventory.write");

    expect(createClient).toHaveBeenCalledWith({ schema: "core" });
  });

  it("throws a message naming the permission when the caller lacks it", async () => {
    mockRpc({ data: false, error: null });
    await expect(requirePermission(BUSINESS, "inventory.write")).rejects.toThrow("inventory.write");
  });

  it("treats a null answer as a denial, not as permission granted", async () => {
    mockRpc({ data: null, error: null });
    await expect(requirePermission(BUSINESS, "inventory.write")).rejects.toThrow(/permission/i);
  });

  it("propagates an rpc error instead of swallowing it into a denial", async () => {
    mockRpc({ data: null, error: new Error("rpc exploded") });
    await expect(requirePermission(BUSINESS, "inventory.write")).rejects.toThrow("rpc exploded");
  });
});
