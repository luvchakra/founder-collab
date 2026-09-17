/**
 * R9's single duplicate check, shared by all three prospect entry points (manual add,
 * CSV import, AI discovery). The ordering is the substance: domain first because it is
 * the reliable identity, company name second because many prospects have no website on
 * file — and both lookups must stay workspace-scoped, since a cross-workspace "duplicate"
 * would leak the existence of another tenant's prospect.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeSupabase,
  eqFilters,
  opArgs,
  usedOp,
  type QueryResult,
  type RecordedQuery,
} from "@cofounderai/core/test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../../db/server", () => ({ createClient }));

const { findDuplicateProspect } = await import("./duplicates");

const WORKSPACE = "w0000000-0000-0000-0000-000000000001";
const MATCH = { id: "p1", company_name: "Acme Ltd" };

/** `byDomain`/`byName` are what each of the two lookups finds, or null for no match. */
function mockLookups(byDomain: unknown, byName: unknown) {
  const supabase = createFakeSupabase({
    query: (call: RecordedQuery): QueryResult =>
      usedOp(call, "ilike") ? { data: byName, error: null } : { data: byDomain, error: null },
  });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("findDuplicateProspect", () => {
  it("matches on domain and does not fall through to the name lookup", async () => {
    const supabase = mockLookups(MATCH, null);

    expect(
      await findDuplicateProspect(WORKSPACE, { companyName: "Totally Different", website: "acme.com" }),
    ).toEqual(MATCH);
    expect(supabase.queries("prospects")).toHaveLength(1);
  });

  it("normalizes the website to a bare domain before matching", async () => {
    const supabase = mockLookups(MATCH, null);

    await findDuplicateProspect(WORKSPACE, { companyName: "Acme", website: "https://www.acme.com/pricing" });

    expect(eqFilters(supabase.queries("prospects")[0]!)).toMatchObject({ domain: "acme.com" });
  });

  it("falls back to a case-insensitive company-name match when the domain misses", async () => {
    const supabase = mockLookups(null, MATCH);

    expect(await findDuplicateProspect(WORKSPACE, { companyName: "acme ltd", website: "other.com" })).toEqual(
      MATCH,
    );
    expect(opArgs(supabase.queries("prospects")[1]!, "ilike")).toEqual(["company_name", "acme ltd"]);
  });

  it("skips the domain lookup entirely when the candidate has no website", async () => {
    const supabase = mockLookups(MATCH, null);

    await findDuplicateProspect(WORKSPACE, { companyName: "Acme Ltd" });

    expect(supabase.queries("prospects")).toHaveLength(1);
    expect(usedOp(supabase.queries("prospects")[0]!, "ilike")).toBe(true);
  });

  it("skips the domain lookup when the website is unparseable", async () => {
    const supabase = mockLookups(MATCH, null);

    await findDuplicateProspect(WORKSPACE, { companyName: "Acme Ltd", website: "not a url" });

    expect(supabase.queries("prospects").every((c) => usedOp(c, "ilike"))).toBe(true);
  });

  it("trims the company name before matching", async () => {
    const supabase = mockLookups(null, null);

    await findDuplicateProspect(WORKSPACE, { companyName: "  Acme Ltd  " });

    expect(opArgs(supabase.queries("prospects")[0]!, "ilike")).toEqual(["company_name", "Acme Ltd"]);
  });

  it("returns null without querying when the name is blank and there is no website", async () => {
    const supabase = mockLookups(null, MATCH);

    expect(await findDuplicateProspect(WORKSPACE, { companyName: "   " })).toBeNull();
    expect(supabase.queries("prospects")).toEqual([]);
  });

  it("returns null when neither lookup matches", async () => {
    mockLookups(null, null);

    expect(await findDuplicateProspect(WORKSPACE, { companyName: "Acme", website: "acme.com" })).toBeNull();
  });

  it("scopes both lookups to the caller's workspace", async () => {
    const supabase = mockLookups(null, null);

    await findDuplicateProspect(WORKSPACE, { companyName: "Acme", website: "acme.com" });

    for (const query of supabase.queries("prospects")) {
      expect(eqFilters(query)).toMatchObject({ workspace_id: WORKSPACE });
    }
  });

  it("propagates a failed domain lookup instead of reporting 'not a duplicate'", async () => {
    createClient.mockResolvedValue(
      createFakeSupabase({ query: () => ({ data: null, error: new Error("select denied") }) }),
    );

    await expect(
      findDuplicateProspect(WORKSPACE, { companyName: "Acme", website: "acme.com" }),
    ).rejects.toThrow("select denied");
  });
});
