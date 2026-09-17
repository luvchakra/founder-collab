import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { listAuditLogForBusiness } = await import("./queries");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";

function mock(data: unknown, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("listAuditLogForBusiness", () => {
  it("returns the business's entries, newest first", async () => {
    const supabase = mock([{ id: "a1" }]);

    await listAuditLogForBusiness(BUSINESS);

    const call = supabase.queries("audit_log")[0]!;
    expect(eqFilters(call)).toEqual({ business_id: BUSINESS });
    expect(opArgs(call, "order")).toEqual(["created_at", { ascending: false }]);
  });

  it("narrows to one entity type when asked", async () => {
    const supabase = mock([]);

    await listAuditLogForBusiness(BUSINESS, "license");

    expect(eqFilters(supabase.queries("audit_log")[0]!)).toEqual({
      business_id: BUSINESS,
      entity_type: "license",
    });
  });

  it("does not filter by entity type when none is given", async () => {
    const supabase = mock([]);

    await listAuditLogForBusiness(BUSINESS);

    expect(eqFilters(supabase.queries("audit_log")[0]!)).not.toHaveProperty("entity_type");
  });

  it("treats an empty-string entity type as 'no filter', matching its falsy guard", async () => {
    const supabase = mock([]);

    await listAuditLogForBusiness(BUSINESS, "");

    expect(eqFilters(supabase.queries("audit_log")[0]!)).not.toHaveProperty("entity_type");
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(listAuditLogForBusiness(BUSINESS)).rejects.toThrow("denied");
  });
});
