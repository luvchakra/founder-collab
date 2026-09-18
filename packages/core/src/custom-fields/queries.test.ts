import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs, usedOp } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { listCustomFieldDefs, listCustomFieldValues } = await import("./queries");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";

function mock(data: unknown, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("listCustomFieldDefs", () => {
  it("scopes to a business and entity type, in sort order", async () => {
    const supabase = mock([]);

    await listCustomFieldDefs(BUSINESS, "job");

    const call = supabase.queries("custom_field_defs")[0]!;
    expect(eqFilters(call)).toEqual({ business_id: BUSINESS, entity_type: "job" });
    expect(opArgs(call, "order")).toEqual(["sort_order"]);
  });

  it("includes both the service-type's own fields and the unscoped ones", async () => {
    const supabase = mock([]);

    await listCustomFieldDefs(BUSINESS, "job", "svc-1");

    expect(opArgs(supabase.queries("custom_field_defs")[0]!, "or")).toEqual([
      "service_type_id.is.null,service_type_id.eq.svc-1",
    ]);
  });

  it("does not add the service-type clause when none is given", async () => {
    const supabase = mock([]);

    await listCustomFieldDefs(BUSINESS, "job");

    expect(usedOp(supabase.queries("custom_field_defs")[0]!, "or")).toBe(false);
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(listCustomFieldDefs(BUSINESS, "job")).rejects.toThrow("denied");
  });
});

describe("listCustomFieldValues", () => {
  it("scopes to the one entity", async () => {
    const supabase = mock([]);
    await listCustomFieldValues("job-1");
    expect(eqFilters(supabase.queries("custom_field_values")[0]!)).toEqual({ entity_id: "job-1" });
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(listCustomFieldValues("job-1")).rejects.toThrow("denied");
  });
});
