/**
 * `publish()` is mechanism 3 of ADR-5's three legal cross-module mechanisms. These tests
 * pin the two things a caller depends on: that publishing runs as the signed-in user
 * through RLS (never the admin client — a publisher always has a business it belongs
 * to), and that `requiredModule` is carried onto the row, since that column is the only
 * thing that makes the drain loop park instead of fail for an unlicensed consumer.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, writtenRow } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { publish } = await import("./mutations");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";

function mockInsert(result: { data: unknown; error: unknown }) {
  const supabase = createFakeSupabase({ query: () => result });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("publish", () => {
  it("inserts the event as the signed-in user against the core schema", async () => {
    const supabase = mockInsert({ data: { id: "e1" }, error: null });

    await publish({ businessId: BUSINESS, type: "inventory.stock_low" });

    expect(createClient).toHaveBeenCalledWith({ schema: "core" });
    expect(supabase.queries("domain_events")).toHaveLength(1);
  });

  it("defaults payload to an empty object and required_module to null", async () => {
    const supabase = mockInsert({ data: { id: "e1" }, error: null });

    await publish({ businessId: BUSINESS, type: "inventory.stock_low" });

    expect(writtenRow(supabase.queries("domain_events")[0]!)).toEqual({
      business_id: BUSINESS,
      type: "inventory.stock_low",
      payload: {},
      required_module: null,
    });
  });

  it("carries requiredModule onto the row so the drain loop can park it", async () => {
    const supabase = mockInsert({ data: { id: "e1" }, error: null });

    await publish({
      businessId: BUSINESS,
      type: "fsm.job_completed",
      payload: { job_id: "j1" },
      requiredModule: "inventory",
    });

    expect(writtenRow(supabase.queries("domain_events")[0]!)).toMatchObject({
      payload: { job_id: "j1" },
      required_module: "inventory",
    });
  });

  it("returns the inserted row", async () => {
    mockInsert({ data: { id: "e1", type: "fsm.job_completed" }, error: null });

    await expect(publish({ businessId: BUSINESS, type: "fsm.job_completed" })).resolves.toMatchObject(
      { id: "e1" },
    );
  });

  it("propagates an insert failure (e.g. an RLS denial) to the caller", async () => {
    mockInsert({ data: null, error: new Error("row-level security") });

    await expect(publish({ businessId: BUSINESS, type: "fsm.job_completed" })).rejects.toThrow(
      "row-level security",
    );
  });
});
