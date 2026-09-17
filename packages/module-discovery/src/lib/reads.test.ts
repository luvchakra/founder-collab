/**
 * The module's straightforward read layer, covered together: every one of these is a
 * tenant- or entity-scoped select whose ordering encodes a product rule (prospect_scores
 * is append-only, so "the score" is the newest row; conversations surface most-recent
 * first), and every one must propagate an RLS denial rather than returning an empty list
 * that reads as "nothing here".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs } from "@cofounderai/core/test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { listContacts } = await import("./contacts/queries");
const { getConversation, getOpenConversation, listConversations } = await import("./conversations/queries");
const { getIcpProfile } = await import("./icp/queries");
const { getLatestOutreachStrategy, getOutreachStrategy } = await import("./outreach/queries");
const { getProspectResearch } = await import("./research/queries");
const { getProspectScore, listRecentProspectScores } = await import("./scoring/queries");
const { listProductKnowledge } = await import("./knowledge/queries");
const { listMessages } = await import("./messages/queries");
const { getAiProviderConnection } = await import("./ai-providers/queries");

const PROSPECT = "p0000000-0000-0000-0000-000000000001";
const WORKSPACE = "w0000000-0000-0000-0000-000000000001";

function mock(data: unknown, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("listContacts", () => {
  it("lists a prospect's contacts oldest first", async () => {
    const supabase = mock([]);

    await listContacts(PROSPECT);

    const call = supabase.queries("contacts")[0]!;
    expect(eqFilters(call)).toEqual({ prospect_id: PROSPECT });
    expect(opArgs(call, "order")).toEqual(["created_at", { ascending: true }]);
  });
});

describe("conversation queries", () => {
  it("finds the newest non-closed conversation on a channel", async () => {
    const supabase = mock(null);

    await getOpenConversation(PROSPECT, "email");

    const call = supabase.queries("conversations")[0]!;
    expect(eqFilters(call)).toEqual({ prospect_id: PROSPECT, channel: "email" });
    expect(opArgs(call, "neq")).toEqual(["status", "closed"]);
    expect(opArgs(call, "order")).toEqual(["last_message_at", { ascending: false }]);
    expect(opArgs(call, "limit")).toEqual([1]);
  });

  it("returns null when no conversation is open", async () => {
    mock(null);
    await expect(getOpenConversation(PROSPECT, "email")).resolves.toBeNull();
  });

  it("fetches one conversation by id", async () => {
    const supabase = mock({ id: "c1" });
    await expect(getConversation("c1")).resolves.toMatchObject({ id: "c1" });
    expect(eqFilters(supabase.queries("conversations")[0]!)).toEqual({ id: "c1" });
  });

  it("lists a prospect's conversations most-recent first", async () => {
    const supabase = mock([]);

    await listConversations(PROSPECT);

    expect(opArgs(supabase.queries("conversations")[0]!, "order")).toEqual([
      "last_message_at",
      { ascending: false },
    ]);
  });
});

describe("getIcpProfile", () => {
  it("returns the workspace's ICP, or null when there is none", async () => {
    const supabase = mock({ id: "icp-1" });
    await expect(getIcpProfile(WORKSPACE)).resolves.toMatchObject({ id: "icp-1" });
    expect(eqFilters(supabase.queries("icp_profiles")[0]!)).toEqual({ workspace_id: WORKSPACE });

    mock(null);
    await expect(getIcpProfile("other-workspace")).resolves.toBeNull();
  });
});

describe("outreach queries", () => {
  it("takes the newest strategy as 'the' strategy", async () => {
    const supabase = mock(null);

    await getLatestOutreachStrategy(PROSPECT);

    const call = supabase.queries("outreach_strategies")[0]!;
    expect(opArgs(call, "order")).toEqual(["created_at", { ascending: false }]);
    expect(opArgs(call, "limit")).toEqual([1]);
  });

  it("fetches one strategy by id", async () => {
    const supabase = mock({ id: "s1" });
    await expect(getOutreachStrategy("s1")).resolves.toMatchObject({ id: "s1" });
    expect(eqFilters(supabase.queries("outreach_strategies")[0]!)).toEqual({ id: "s1" });
  });
});

describe("getProspectResearch", () => {
  it("returns a prospect's research, or null before any has run", async () => {
    const supabase = mock(null);
    await expect(getProspectResearch(PROSPECT)).resolves.toBeNull();
    expect(eqFilters(supabase.queries("prospect_research")[0]!)).toEqual({ prospect_id: PROSPECT });
  });
});

describe("scoring queries", () => {
  it("treats the newest row as the current score, since the table is append-only", async () => {
    const supabase = mock(null);

    await getProspectScore(PROSPECT);

    const call = supabase.queries("prospect_scores")[0]!;
    expect(opArgs(call, "order")).toEqual(["created_at", { ascending: false }]);
    expect(opArgs(call, "limit")).toEqual([1]);
  });

  it("defaults the trend window to the last two scores", async () => {
    const supabase = mock([]);
    await listRecentProspectScores(PROSPECT);
    expect(opArgs(supabase.queries("prospect_scores")[0]!, "limit")).toEqual([2]);
  });

  it("honours an explicit window", async () => {
    const supabase = mock([]);
    await listRecentProspectScores(PROSPECT, 10);
    expect(opArgs(supabase.queries("prospect_scores")[0]!, "limit")).toEqual([10]);
  });
});

describe("listProductKnowledge", () => {
  it("lists a workspace's knowledge oldest first", async () => {
    const supabase = mock([]);

    await listProductKnowledge(WORKSPACE);

    const call = supabase.queries("product_knowledge")[0]!;
    expect(eqFilters(call)).toEqual({ workspace_id: WORKSPACE });
    expect(opArgs(call, "order")).toEqual(["created_at", { ascending: true }]);
  });
});

describe("listMessages", () => {
  it("lists a prospect's messages newest first", async () => {
    const supabase = mock([]);

    await listMessages(PROSPECT);

    expect(opArgs(supabase.queries("messages")[0]!, "order")).toEqual([
      "created_at",
      { ascending: false },
    ]);
  });
});

describe("getAiProviderConnection", () => {
  it("never selects the encrypted key — only the router may read that", async () => {
    const supabase = mock(null);

    await getAiProviderConnection("acct-1");

    expect(String(opArgs(supabase.queries("ai_provider_credentials")[0]!, "select")![0])).not.toContain(
      "encrypted_api_key",
    );
  });

  it("maps the row to the UI's camelCase shape", async () => {
    mock({
      provider: "anthropic",
      key_fingerprint: "ab12",
      status: "valid",
      last_validated_at: "2026-09-17T00:00:00Z",
      last_error: null,
    });

    await expect(getAiProviderConnection("acct-1")).resolves.toEqual({
      provider: "anthropic",
      keyFingerprint: "ab12",
      status: "valid",
      lastValidatedAt: "2026-09-17T00:00:00Z",
      lastError: null,
    });
  });

  it("returns null when the account has connected no provider", async () => {
    mock(null);
    await expect(getAiProviderConnection("acct-1")).resolves.toBeNull();
  });
});

describe("failure propagation", () => {
  it.each([
    ["listContacts", () => listContacts(PROSPECT)],
    ["getOpenConversation", () => getOpenConversation(PROSPECT, "email")],
    ["getConversation", () => getConversation("c1")],
    ["listConversations", () => listConversations(PROSPECT)],
    ["getIcpProfile", () => getIcpProfile("workspace-for-error")],
    ["getLatestOutreachStrategy", () => getLatestOutreachStrategy(PROSPECT)],
    ["getOutreachStrategy", () => getOutreachStrategy("s1")],
    ["getProspectResearch", () => getProspectResearch(PROSPECT)],
    ["getProspectScore", () => getProspectScore(PROSPECT)],
    ["listRecentProspectScores", () => listRecentProspectScores(PROSPECT)],
    ["listProductKnowledge", () => listProductKnowledge(WORKSPACE)],
    ["listMessages", () => listMessages(PROSPECT)],
    ["getAiProviderConnection", () => getAiProviderConnection("acct-1")],
  ])("%s propagates an RLS denial rather than reporting nothing", async (_label, run) => {
    mock(null, new Error("denied"));
    await expect(run()).rejects.toThrow("denied");
  });
});
