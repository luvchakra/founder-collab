import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { listDomainEventsForBusiness } = await import("./queries");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";

function mock(data: unknown, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("listDomainEventsForBusiness", () => {
  it("lists a business's events newest first, RLS-scoped against core", async () => {
    const supabase = mock([]);

    await listDomainEventsForBusiness(BUSINESS);

    const call = supabase.queries("domain_events")[0]!;
    expect(eqFilters(call)).toEqual({ business_id: BUSINESS });
    expect(opArgs(call, "order")).toEqual(["published_at", { ascending: false }]);
    expect(createClient).toHaveBeenCalledWith({ schema: "core" });
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(listDomainEventsForBusiness(BUSINESS)).rejects.toThrow("denied");
  });
});
