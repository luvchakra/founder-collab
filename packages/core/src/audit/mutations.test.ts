/**
 * The audit log is a compliance record, so the thing worth pinning is that an omitted
 * optional argument becomes an explicit null on the row rather than being dropped — a
 * missing key and a recorded "nothing here" are different claims about what happened.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { writeAuditLog } = await import("./mutations");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";

function mockRpc(result: { data: unknown; error: unknown }) {
  const supabase = createFakeSupabase({ rpc: () => result });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("writeAuditLog", () => {
  it("writes through core.write_audit_log and returns the new entry id", async () => {
    const supabase = mockRpc({ data: "audit-1", error: null });

    const id = await writeAuditLog({
      businessId: BUSINESS,
      action: "license.activated",
      entityType: "license",
    });

    expect(id).toBe("audit-1");
    expect(supabase.rpcs("write_audit_log")).toHaveLength(1);
  });

  it("records every omitted optional as an explicit null", async () => {
    const supabase = mockRpc({ data: "audit-1", error: null });

    await writeAuditLog({ businessId: BUSINESS, action: "a", entityType: "e" });

    expect(supabase.rpcs("write_audit_log")[0]!.args).toEqual({
      p_business_id: BUSINESS,
      p_actor_id: null,
      p_action: "a",
      p_entity_type: "e",
      p_entity_id: null,
      p_before: null,
      p_after: null,
    });
  });

  it("carries a full before/after pair through unchanged", async () => {
    const supabase = mockRpc({ data: "audit-1", error: null });

    await writeAuditLog({
      businessId: BUSINESS,
      actorId: "u1",
      action: "status.changed",
      entityType: "sales_order",
      entityId: "so-1",
      before: { status: "draft" },
      after: { status: "confirmed" },
    });

    expect(supabase.rpcs("write_audit_log")[0]!.args).toMatchObject({
      p_actor_id: "u1",
      p_entity_id: "so-1",
      p_before: { status: "draft" },
      p_after: { status: "confirmed" },
    });
  });

  it("runs as the signed-in user against core, not the admin client", async () => {
    mockRpc({ data: "audit-1", error: null });

    await writeAuditLog({ businessId: BUSINESS, action: "a", entityType: "e" });

    expect(createClient).toHaveBeenCalledWith({ schema: "core" });
  });

  it("propagates a failure instead of silently dropping the audit entry", async () => {
    mockRpc({ data: null, error: new Error("rpc denied") });

    await expect(writeAuditLog({ businessId: BUSINESS, action: "a", entityType: "e" })).rejects.toThrow(
      "rpc denied",
    );
  });
});
