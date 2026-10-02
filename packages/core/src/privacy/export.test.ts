import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, type RecordedQuery } from "../test-support/fake-supabase";

/** PRIV-2: the personal-data export reads only the requesting user's own rows. */

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock("../db/admin", () => ({ createAdminClient }));

const { buildPersonalDataExport, EXPORT_AUDIT_LIMIT } = await import("./export");

const USER = "u0000000-0000-4000-8000-000000000001";

function mock(rowsByTable: Record<string, unknown[]>, authUser: unknown = { id: USER, email: "ravi@example.in", created_at: "2026-09-01", user_metadata: { full_name: "Ravi" }, app_metadata: { providers: ["email"] }, factors: [] }) {
  const supabase = createFakeSupabase({ query: (call: RecordedQuery) => ({ data: rowsByTable[call.table] ?? [], error: null }) });
  const getUserById = vi.fn(async () => ({ data: { user: authUser }, error: null }));
  createAdminClient.mockReturnValue({ ...supabase, auth: { admin: { getUserById } } });
  return { supabase, getUserById };
}

beforeEach(() => vi.clearAllMocks());

describe("buildPersonalDataExport (PRIV-2)", () => {
  it("collects the user's identity, profile, memberships, employee records and attributed actions", async () => {
    const { supabase, getUserById } = mock({
      user_profiles: [{ full_name: "Ravi" }],
      account_members: [{ account_id: "a1", role: "owner" }],
      business_members: [{ business_id: "b1" }],
      employees: [{ business_id: "b1", job_title: "Founder" }],
      audit_log: [{ action: "invoice.issued" }],
    });

    const data = await buildPersonalDataExport(USER);

    expect(getUserById).toHaveBeenCalledWith(USER);
    expect(data).toMatchObject({
      account: { id: USER, email: "ravi@example.in", sign_in_providers: ["email"], profile_details: { full_name: "Ravi" } },
      profile: { full_name: "Ravi" },
      account_memberships: [{ account_id: "a1" }],
      business_memberships: [{ business_id: "b1" }],
      employee_records: [{ job_title: "Founder" }],
      actions_attributed_to_you: [{ action: "invoice.issued" }],
    });
    expect((data.about as { storage_location: string }).storage_location).toContain("Mumbai");

    // Every query is filtered on this user, never on anything wider.
    const filters = Object.fromEntries(supabase.queries().map((q) => [q.table, eqFilters(q)]));
    expect(filters).toEqual({
      user_profiles: { id: USER },
      account_members: { user_id: USER },
      business_members: { user_id: USER },
      employees: { user_id: USER },
      audit_log: { actor_id: USER },
    });
    const audit = supabase.queries("audit_log")[0]!;
    expect(audit.ops.find((op) => op.method === "limit")!.args).toEqual([EXPORT_AUDIT_LIMIT]);
  });

  it("fails rather than exporting someone else's data if the identity doesn't match", async () => {
    mock({}, { id: "someone-else" });
    await expect(buildPersonalDataExport(USER)).rejects.toThrow("User not found.");
  });

  it("propagates a read failure instead of returning a partial export", async () => {
    const supabase = createFakeSupabase({
      query: (call: RecordedQuery) => (call.table === "audit_log" ? { data: null, error: new Error("denied") } : { data: [], error: null }),
    });
    createAdminClient.mockReturnValue({
      ...supabase,
      auth: { admin: { getUserById: async () => ({ data: { user: { id: USER } }, error: null }) } },
    });
    await expect(buildPersonalDataExport(USER)).rejects.toThrow("denied");
  });
});
