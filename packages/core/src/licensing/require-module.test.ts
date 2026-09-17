/**
 * Layer 3 of licensing enforcement. RLS stays authoritative, so what is tested here is
 * that the guard asks the *right* question — `has_module_write` for a mutating action,
 * so ADR-9's read-only grace window actually blocks writes — and that anything other than
 * an explicit `true` is treated as a denial.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { hasModule, requireModule } = await import("./require-module");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";

function mockRpc(result: { data: unknown; error: unknown }) {
  const supabase = createFakeSupabase({ rpc: () => result });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("requireModule", () => {
  it("resolves when the module is licensed for writes", async () => {
    mockRpc({ data: true, error: null });

    await expect(requireModule(BUSINESS, "inventory")).resolves.toBeUndefined();
  });

  it("defaults to the write check, so a grace-period licence blocks a mutating action", async () => {
    const supabase = mockRpc({ data: true, error: null });

    await requireModule(BUSINESS, "inventory");

    expect(supabase.rpcs()[0]!.fn).toBe("has_module_write");
  });

  it("uses the read check when asked explicitly", async () => {
    const supabase = mockRpc({ data: true, error: null });

    await requireModule(BUSINESS, "inventory", { write: false });

    expect(supabase.rpcs()[0]!.fn).toBe("has_module");
  });

  it("asks about the business and module it was given", async () => {
    const supabase = mockRpc({ data: true, error: null });

    await requireModule(BUSINESS, "fsm");

    expect(supabase.rpcs()[0]!.args).toEqual({ p_business_id: BUSINESS, p_key: "fsm" });
  });

  it("runs as the signed-in user against core, never the RLS-bypassing admin client", async () => {
    mockRpc({ data: true, error: null });

    await requireModule(BUSINESS, "inventory");

    expect(createClient).toHaveBeenCalledWith({ schema: "core" });
  });

  it("throws a message naming the module when it is not licensed", async () => {
    mockRpc({ data: false, error: null });

    await expect(requireModule(BUSINESS, "inventory")).rejects.toThrow(/inventory/);
  });

  it("distinguishes a write denial from a read denial in the message", async () => {
    mockRpc({ data: false, error: null });
    await expect(requireModule(BUSINESS, "inventory")).rejects.toThrow(/write access/);

    mockRpc({ data: false, error: null });
    await expect(requireModule(BUSINESS, "inventory", { write: false })).rejects.toThrow(
      /not licensed on this business/,
    );
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
  ])("treats %s as a denial rather than a grant", async (_label, data) => {
    mockRpc({ data, error: null });

    await expect(requireModule(BUSINESS, "inventory")).rejects.toThrow(/not licensed/);
  });

  it("propagates an rpc error instead of collapsing it into a denial", async () => {
    mockRpc({ data: null, error: new Error("rpc exploded") });

    await expect(requireModule(BUSINESS, "inventory")).rejects.toThrow("rpc exploded");
  });
});

describe("hasModule", () => {
  it("returns true/false rather than throwing — ADR-10's degraded-mode caller", async () => {
    mockRpc({ data: true, error: null });
    expect(await hasModule(BUSINESS, "inventory")).toBe(true);

    mockRpc({ data: false, error: null });
    expect(await hasModule(BUSINESS, "inventory")).toBe(false);
  });

  it("defaults to the read check, since a degraded-mode caller usually only reads", async () => {
    const supabase = mockRpc({ data: true, error: null });

    await hasModule(BUSINESS, "inventory");

    expect(supabase.rpcs()[0]!.fn).toBe("has_module");
  });

  it("uses the write check when asked", async () => {
    const supabase = mockRpc({ data: true, error: null });

    await hasModule(BUSINESS, "inventory", { write: true });

    expect(supabase.rpcs()[0]!.fn).toBe("has_module_write");
  });

  it.each([
    ["null", null],
    ["a truthy non-boolean", 1],
  ])("returns false for %s rather than coercing it", async (_label, data) => {
    mockRpc({ data, error: null });

    expect(await hasModule(BUSINESS, "inventory")).toBe(false);
  });

  it("still propagates an rpc error", async () => {
    mockRpc({ data: null, error: new Error("rpc exploded") });

    await expect(hasModule(BUSINESS, "inventory")).rejects.toThrow("rpc exploded");
  });
});
