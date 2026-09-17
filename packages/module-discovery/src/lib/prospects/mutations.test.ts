/**
 * The prospect write layer, and the bridge that keeps a prospect and a future customer the
 * same `core.parties` row. The rules under test: every entry point normalizes and links a
 * party (00-MASTER-PLAN.md §5 — winning adds a role, it never copies a record), approving
 * a suggestion carries "why we sourced this" forward into research rather than dropping it
 * (R5), and a suggestion is only removed from staging once the prospect it became exists.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFakeSupabase,
  eqFilters,
  opArgs,
  usedOp,
  writtenRow,
  type RecordedQuery,
} from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  ensureProspectParty: vi.fn(),
  markProspectPartyWon: vi.fn(),
}));

vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("./party-sync", () => ({
  ensureProspectParty: h.ensureProspectParty,
  markProspectPartyWon: h.markProspectPartyWon,
}));

const {
  approveProspectSuggestions,
  createProspect,
  createProspectsBulk,
  discardProspectSuggestions,
  extractDomain,
  setProspectOutcome,
  updateProspect,
  updateProspectStatus,
} = await import("./mutations");

const WORKSPACE = "w0000000-0000-0000-0000-000000000001";

function mock(responder: (call: RecordedQuery) => { data: unknown; error: unknown }) {
  const supabase = createFakeSupabase({ query: responder });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

const prospectRow = { id: "p1", workspace_id: WORKSPACE, party_id: null, company_name: "Acme", company_email: null };

beforeEach(() => {
  vi.clearAllMocks();
  h.ensureProspectParty.mockResolvedValue("party-1");
});

describe("extractDomain", () => {
  it.each([
    ["a bare domain", "acme.com", "acme.com"],
    ["a www prefix", "www.acme.com", "acme.com"],
    ["an absolute URL with a path", "https://www.acme.com/pricing", "acme.com"],
    ["a subdomain", "app.acme.com", "app.acme.com"],
    ["an http URL", "http://acme.com", "acme.com"],
  ])("extracts %s", (_label, input, expected) => {
    expect(extractDomain(input)).toBe(expected);
  });

  it.each([["an unparseable string", "not a url"], ["an empty string", ""]])(
    "returns null for %s rather than throwing",
    (_label, input) => {
      expect(extractDomain(input)).toBeNull();
    },
  );
});

describe("createProspect", () => {
  it("normalizes every field, deriving the domain from the website", async () => {
    const supabase = mock(() => ({ data: prospectRow, error: null }));

    await createProspect(WORKSPACE, {
      companyName: "  Acme  ",
      website: " https://www.acme.com/x ",
      industry: "  ",
      linkedinUrl: "linkedin.com/company/acme",
      twitterUrl: "  ",
      companyEmail: " hi@acme.com ",
    });

    expect(writtenRow(supabase.queries("prospects")[0]!)).toMatchObject({
      workspace_id: WORKSPACE,
      company_name: "Acme",
      website: "https://www.acme.com/x",
      domain: "acme.com",
      industry: null,
      linkedin_url: "https://linkedin.com/company/acme",
      twitter_url: null,
      company_email: "hi@acme.com",
    });
  });

  it("leaves the domain null when no website was given", async () => {
    const supabase = mock(() => ({ data: prospectRow, error: null }));

    await createProspect(WORKSPACE, { companyName: "Acme" });

    expect(writtenRow(supabase.queries("prospects")[0]!)).toMatchObject({ domain: null });
  });

  it("links the new prospect to a core.parties row", async () => {
    const supabase = mock(() => ({ data: prospectRow, error: null }));

    await createProspect(WORKSPACE, { companyName: "Acme" });

    expect(h.ensureProspectParty).toHaveBeenCalledWith(WORKSPACE, null, {
      name: "Acme",
      email: null,
    });
    expect(writtenRow(supabase.queries("prospects")[1]!)).toEqual({ party_id: "party-1" });
  });

  it.each([["an empty name", ""], ["a whitespace name", "   "]])(
    "rejects %s before writing",
    async (_label, companyName) => {
      const supabase = mock(() => ({ data: prospectRow, error: null }));

      await expect(createProspect(WORKSPACE, { companyName })).rejects.toThrow(
        "Company name is required.",
      );
      expect(supabase.queries()).toEqual([]);
    },
  );

  it("propagates a failed insert without attempting to link a party", async () => {
    mock(() => ({ data: null, error: new Error("insert denied") }));

    await expect(createProspect(WORKSPACE, { companyName: "Acme" })).rejects.toThrow("insert denied");
    expect(h.ensureProspectParty).not.toHaveBeenCalled();
  });

  it("propagates a failed party link", async () => {
    mock((call) =>
      usedOp(call, "update") ? { data: null, error: new Error("link denied") } : { data: prospectRow, error: null },
    );

    await expect(createProspect(WORKSPACE, { companyName: "Acme" })).rejects.toThrow("link denied");
  });
});

describe("updateProspect / updateProspectStatus", () => {
  it("rewrites the whole normalized row on the one prospect", async () => {
    const supabase = mock(() => ({ data: prospectRow, error: null }));

    await updateProspect("p1", { companyName: " Acme ", website: "acme.com" });

    const call = supabase.queries("prospects")[0]!;
    expect(writtenRow(call)).toMatchObject({ company_name: "Acme", domain: "acme.com" });
    expect(eqFilters(call)).toEqual({ id: "p1" });
  });

  it("rejects clearing the company name", async () => {
    mock(() => ({ data: prospectRow, error: null }));
    await expect(updateProspect("p1", { companyName: "" })).rejects.toThrow("Company name is required.");
  });

  it("sets status without touching anything else", async () => {
    const supabase = mock(() => ({ data: prospectRow, error: null }));

    await updateProspectStatus("p1", "qualified");

    expect(writtenRow(supabase.queries("prospects")[0]!)).toEqual({ status: "qualified" });
  });

  it.each([
    ["updateProspect", () => updateProspect("p1", { companyName: "Acme" })],
    ["updateProspectStatus", () => updateProspectStatus("p1", "qualified")],
  ])("%s propagates a failure", async (_label, run) => {
    mock(() => ({ data: null, error: new Error("denied") }));
    await expect(run()).rejects.toThrow("denied");
  });
});

describe("setProspectOutcome", () => {
  it("adds the customer role to the same party when the outcome is won", async () => {
    mock(() => ({ data: { ...prospectRow, party_id: "party-1" }, error: null }));

    await setProspectOutcome("p1", "won");

    expect(h.markProspectPartyWon).toHaveBeenCalledWith(WORKSPACE, "party-1");
  });

  it.each(["lost", "open"] as const)("does not touch roles for a '%s' outcome", async (outcome) => {
    mock(() => ({ data: { ...prospectRow, party_id: "party-1" }, error: null }));

    await setProspectOutcome("p1", outcome);

    expect(h.markProspectPartyWon).not.toHaveBeenCalled();
  });

  it("still records the outcome for a prospect that was never linked to a party", async () => {
    const supabase = mock(() => ({ data: { ...prospectRow, party_id: null }, error: null }));

    await expect(setProspectOutcome("p1", "won")).resolves.toMatchObject({ id: "p1" });

    expect(h.markProspectPartyWon).not.toHaveBeenCalled();
    expect(writtenRow(supabase.queries("prospects")[0]!)).toEqual({ outcome: "won" });
  });

  it("propagates a failure", async () => {
    mock(() => ({ data: null, error: new Error("denied") }));
    await expect(setProspectOutcome("p1", "won")).rejects.toThrow("denied");
  });
});

describe("createProspectsBulk", () => {
  it("inserts every row in one call and links each to a party", async () => {
    const rows = [
      { ...prospectRow, id: "p1", company_name: "Acme" },
      { ...prospectRow, id: "p2", company_name: "Beta" },
    ];
    const supabase = mock((call) => ({ data: usedOp(call, "insert") ? rows : rows, error: null }));

    await expect(
      createProspectsBulk(WORKSPACE, [{ companyName: "Acme" }, { companyName: "Beta" }]),
    ).resolves.toBe(2);

    expect((writtenRow(supabase.queries("prospects")[0]!) as unknown as unknown[]).length).toBe(2);
    expect(h.ensureProspectParty).toHaveBeenCalledTimes(2);
  });

  it("short-circuits an empty list without querying", async () => {
    const supabase = mock(() => ({ data: [], error: null }));

    await expect(createProspectsBulk(WORKSPACE, [])).resolves.toBe(0);
    expect(supabase.queries()).toEqual([]);
  });

  it("rejects the whole batch if any row has no company name", async () => {
    const supabase = mock(() => ({ data: [], error: null }));

    await expect(
      createProspectsBulk(WORKSPACE, [{ companyName: "Acme" }, { companyName: "" }]),
    ).rejects.toThrow("Company name is required.");
    expect(supabase.queries()).toEqual([]);
  });

  it("propagates a failed insert", async () => {
    mock(() => ({ data: null, error: new Error("denied") }));
    await expect(createProspectsBulk(WORKSPACE, [{ companyName: "Acme" }])).rejects.toThrow("denied");
  });
});

describe("approveProspectSuggestions", () => {
  const suggestion = {
    id: "s1",
    company_name: "Acme",
    website: "acme.com",
    industry: null,
    company_size: null,
    location: null,
    description: null,
    match_reason: "Hiring ops staff",
    source_url: "https://news.example/acme",
  };

  function mockApproval(suggestions: unknown[], inserted: unknown[]) {
    return mock((call) => {
      if (call.table === "prospect_suggestions") {
        return { data: usedOp(call, "delete") ? null : suggestions, error: null };
      }
      if (call.table === "prospects") return { data: inserted, error: null };
      return { data: null, error: null };
    });
  }

  it("inserts a prospect per suggestion and reports how many were added", async () => {
    mockApproval([suggestion], [{ ...prospectRow, id: "p1" }]);

    await expect(approveProspectSuggestions(WORKSPACE, ["s1"])).resolves.toBe(1);
  });

  it("carries the match reason and source into a seeded research row (R5)", async () => {
    const supabase = mockApproval([suggestion], [{ ...prospectRow, id: "p1" }]);

    await approveProspectSuggestions(WORKSPACE, ["s1"]);

    const research = writtenRow(supabase.queries("prospect_research")[0]!) as unknown as Array<{
      prospect_id: string;
      recommended_angle: string;
      evidence: { claim: string; source_url: string; confidence: string }[];
    }>;
    expect(research[0]).toMatchObject({
      prospect_id: "p1",
      recommended_angle: "Hiring ops staff",
      evidence: [
        {
          claim: "Hiring ops staff",
          source_url: "https://news.example/acme",
          confidence: "inference",
        },
      ],
    });
  });

  it("seeds empty evidence when there is a reason but no source", async () => {
    const supabase = mockApproval([{ ...suggestion, source_url: null }], [{ ...prospectRow, id: "p1" }]);

    await approveProspectSuggestions(WORKSPACE, ["s1"]);

    const research = writtenRow(supabase.queries("prospect_research")[0]!) as unknown as Array<{
      evidence: unknown[];
    }>;
    expect(research[0]!.evidence).toEqual([]);
  });

  it("writes no research row for a suggestion carrying neither reason nor source", async () => {
    const supabase = mockApproval(
      [{ ...suggestion, match_reason: null, source_url: null }],
      [{ ...prospectRow, id: "p1" }],
    );

    await approveProspectSuggestions(WORKSPACE, ["s1"]);

    expect(supabase.queries("prospect_research")).toEqual([]);
  });

  it("clears the approved suggestions from staging, scoped to the workspace", async () => {
    const supabase = mockApproval([suggestion], [{ ...prospectRow, id: "p1" }]);

    await approveProspectSuggestions(WORKSPACE, ["s1"]);

    const del = supabase.queries("prospect_suggestions").find((c) => usedOp(c, "delete"))!;
    expect(eqFilters(del)).toEqual({ workspace_id: WORKSPACE });
    expect(opArgs(del, "in")).toEqual(["id", ["s1"]]);
  });

  it("short-circuits an empty id list", async () => {
    const supabase = mock(() => ({ data: [], error: null }));

    await expect(approveProspectSuggestions(WORKSPACE, [])).resolves.toBe(0);
    expect(supabase.queries()).toEqual([]);
  });

  it("does nothing when the ids match no visible suggestion", async () => {
    const supabase = mockApproval([], []);

    await expect(approveProspectSuggestions(WORKSPACE, ["s1"])).resolves.toBe(0);
    expect(supabase.queries("prospects")).toEqual([]);
  });

  it("leaves the suggestions in staging if the prospect insert failed", async () => {
    const supabase = mock((call) => {
      if (call.table === "prospect_suggestions") return { data: [suggestion], error: null };
      return { data: null, error: new Error("insert denied") };
    });

    await expect(approveProspectSuggestions(WORKSPACE, ["s1"])).rejects.toThrow("insert denied");
    expect(supabase.queries("prospect_suggestions").filter((c) => usedOp(c, "delete"))).toEqual([]);
  });

  it("propagates a failed suggestion fetch", async () => {
    mock((call) =>
      call.table === "prospect_suggestions"
        ? { data: null, error: new Error("fetch denied") }
        : { data: [], error: null },
    );

    await expect(approveProspectSuggestions(WORKSPACE, ["s1"])).rejects.toThrow("fetch denied");
  });
});

describe("discardProspectSuggestions", () => {
  it("deletes the given suggestions, scoped to the workspace", async () => {
    const supabase = mock(() => ({ data: null, error: null }));

    await discardProspectSuggestions(WORKSPACE, ["s1", "s2"]);

    const call = supabase.queries("prospect_suggestions")[0]!;
    expect(usedOp(call, "delete")).toBe(true);
    expect(eqFilters(call)).toEqual({ workspace_id: WORKSPACE });
    expect(opArgs(call, "in")).toEqual(["id", ["s1", "s2"]]);
  });

  it("short-circuits an empty list", async () => {
    const supabase = mock(() => ({ data: null, error: null }));

    await discardProspectSuggestions(WORKSPACE, []);

    expect(supabase.queries()).toEqual([]);
  });

  it("propagates a failure", async () => {
    mock(() => ({ data: null, error: new Error("denied") }));
    await expect(discardProspectSuggestions(WORKSPACE, ["s1"])).rejects.toThrow("denied");
  });
});

/**
 * Error paths and empty results. Every one of these is a silent-failure candidate: a
 * party link or research seed that threw but was swallowed would leave a prospect half
 * created, and a delete that failed quietly would leave an approved suggestion sitting in
 * staging to be approved again.
 */
describe("write failures", () => {
  const suggestion = {
    id: "s1",
    company_name: "Acme",
    website: null,
    industry: null,
    company_size: null,
    location: null,
    description: null,
    match_reason: null,
    source_url: "https://news.example/acme",
  };

  it("normalizes a company X/Twitter URL like it does LinkedIn", async () => {
    const supabase = mock(() => ({ data: prospectRow, error: null }));

    await createProspect(WORKSPACE, { companyName: "Acme", twitterUrl: "x.com/acme" });

    expect(writtenRow(supabase.queries("prospects")[0]!)).toMatchObject({
      twitter_url: "https://x.com/acme",
    });
  });

  it("reports nothing inserted when a bulk insert returns no rows", async () => {
    mock(() => ({ data: null, error: null }));

    await expect(
      createProspectsBulk(WORKSPACE, [{ companyName: "Acme" }]),
    ).resolves.toBe(0);
    expect(h.ensureProspectParty).not.toHaveBeenCalled();
  });

  it("propagates a failure to write back the party link", async () => {
    mock((call) => ({
      data: usedOp(call, "update") ? null : [prospectRow],
      error: usedOp(call, "update") ? new Error("link failed") : null,
    }));

    await expect(createProspectsBulk(WORKSPACE, [{ companyName: "Acme" }])).rejects.toThrow(
      "link failed",
    );
  });

  it("propagates a failure to seed the research rows", async () => {
    mock((call) => {
      if (call.table === "prospect_research") return { data: null, error: new Error("research failed") };
      if (call.table === "prospect_suggestions") return { data: [suggestion], error: null };
      return { data: [{ ...prospectRow, id: "p1" }], error: null };
    });

    await expect(approveProspectSuggestions(WORKSPACE, ["s1"])).rejects.toThrow("research failed");
  });

  it("propagates a failure to clear the approved suggestions from staging", async () => {
    mock((call) => {
      if (call.table === "prospect_suggestions") {
        return usedOp(call, "delete")
          ? { data: null, error: new Error("delete failed") }
          : { data: [suggestion], error: null };
      }
      return { data: [{ ...prospectRow, id: "p1" }], error: null };
    });

    await expect(approveProspectSuggestions(WORKSPACE, ["s1"])).rejects.toThrow("delete failed");
  });

  it("describes the evidence generically when the suggestion carried no reason", async () => {
    const supabase = mock((call) => {
      if (call.table === "prospect_suggestions") {
        return { data: usedOp(call, "delete") ? null : [suggestion], error: null };
      }
      if (call.table === "prospects") return { data: [{ ...prospectRow, id: "p1" }], error: null };
      return { data: null, error: null };
    });

    await approveProspectSuggestions(WORKSPACE, ["s1"]);

    const research = writtenRow(supabase.queries("prospect_research")[0]!) as unknown as Array<{
      evidence: { claim: string }[];
    }>;
    expect(research[0]!.evidence[0]!.claim).toBe("Sourced during prospect discovery.");
  });

  it("reports nothing approved when the insert returns no rows", async () => {
    mock((call) => {
      if (call.table === "prospect_suggestions") {
        return { data: usedOp(call, "delete") ? null : [suggestion], error: null };
      }
      return { data: null, error: null };
    });

    await expect(approveProspectSuggestions(WORKSPACE, ["s1"])).resolves.toBe(0);
  });
});
