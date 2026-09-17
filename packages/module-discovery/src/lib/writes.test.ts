/**
 * The module's straightforward write layer. Each of these encodes one product rule worth
 * holding: an ICP edit resets approval (so a changed profile can't stay "approved"
 * silently), chat history is capped and returned oldest-first for rendering, an interest
 * signup treats a duplicate address as a non-event rather than an error, and the founder
 * notification must never turn into a visitor-facing failure.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs, writtenRow } from "@cofounderai/core/test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));
vi.mock("../db/admin", () => ({ createAdminClient }));

const { approveIcpProfile, parseListField, updateIcpProfile } = await import("./icp/mutations");
const { approveOutreachStrategy } = await import("./outreach/mutations");
const { appendChatMessage, listChatMessages } = await import("./chat/queries");
const { recordInterestSignup } = await import("./interest/mutations");

const WORKSPACE = "w0000000-0000-0000-0000-000000000001";

function mock(data: unknown, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data, error }) });
  createClient.mockResolvedValue(supabase);
  createAdminClient.mockReturnValue(supabase);
  return supabase;
}

const ICP_INPUT = {
  name: "Mid-market manufacturers",
  description: "  Makes things  ",
  industries: ["Manufacturing"],
  companySizes: ["50-200"],
  geographies: ["India"],
  roles: ["Ops lead"],
  painPoints: ["Stockouts"],
  buyingSignals: ["Hiring ops"],
  exclusions: ["Retail"],
};

beforeEach(() => vi.clearAllMocks());

describe("updateIcpProfile", () => {
  it("resets status to draft, so an edited profile must be re-approved", async () => {
    const supabase = mock({ id: "icp-1" });

    await updateIcpProfile("icp-1", ICP_INPUT);

    expect(writtenRow(supabase.queries("icp_profiles")[0]!)).toMatchObject({ status: "draft" });
  });

  it("trims the name and description, nulling an empty description", async () => {
    const supabase = mock({ id: "icp-1" });

    await updateIcpProfile("icp-1", { ...ICP_INPUT, name: "  Trimmed  ", description: "   " });

    expect(writtenRow(supabase.queries("icp_profiles")[0]!)).toMatchObject({
      name: "Trimmed",
      description: null,
    });
  });

  it("maps every list field onto its snake_case column", async () => {
    const supabase = mock({ id: "icp-1" });

    await updateIcpProfile("icp-1", ICP_INPUT);

    expect(writtenRow(supabase.queries("icp_profiles")[0]!)).toMatchObject({
      industries: ["Manufacturing"],
      company_sizes: ["50-200"],
      geographies: ["India"],
      roles: ["Ops lead"],
      pain_points: ["Stockouts"],
      buying_signals: ["Hiring ops"],
      exclusions: ["Retail"],
    });
  });

  it.each([["an empty name", ""], ["a whitespace-only name", "   "]])(
    "rejects %s before touching the database",
    async (_label, name) => {
      const supabase = mock({ id: "icp-1" });

      await expect(updateIcpProfile("icp-1", { ...ICP_INPUT, name })).rejects.toThrow(
        "Name is required.",
      );
      expect(supabase.queries()).toEqual([]);
    },
  );

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(updateIcpProfile("icp-1", ICP_INPUT)).rejects.toThrow("denied");
  });
});

describe("approveIcpProfile", () => {
  it("sets status approved on the one profile", async () => {
    const supabase = mock({ id: "icp-1" });

    await approveIcpProfile("icp-1");

    const call = supabase.queries("icp_profiles")[0]!;
    expect(writtenRow(call)).toEqual({ status: "approved" });
    expect(eqFilters(call)).toEqual({ id: "icp-1" });
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(approveIcpProfile("icp-1")).rejects.toThrow("denied");
  });
});

describe("parseListField", () => {
  it("splits one item per line, trimming each", () => {
    expect(parseListField("  one \n two\nthree  ")).toEqual(["one", "two", "three"]);
  });

  it("drops blank lines", () => {
    expect(parseListField("one\n\n\n   \ntwo")).toEqual(["one", "two"]);
  });

  it("returns an empty array for empty or whitespace-only input", () => {
    expect(parseListField("")).toEqual([]);
    expect(parseListField("   \n  ")).toEqual([]);
  });
});

describe("approveOutreachStrategy", () => {
  it("approves the one strategy", async () => {
    const supabase = mock({ id: "s1" });

    await approveOutreachStrategy("s1");

    const call = supabase.queries("outreach_strategies")[0]!;
    expect(writtenRow(call)).toEqual({ status: "approved" });
    expect(eqFilters(call)).toEqual({ id: "s1" });
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(approveOutreachStrategy("s1")).rejects.toThrow("denied");
  });
});

describe("listChatMessages", () => {
  it("caps how much history one page load fetches", async () => {
    const supabase = mock([]);

    await listChatMessages(WORKSPACE);

    const call = supabase.queries("chat_messages")[0]!;
    expect(eqFilters(call)).toEqual({ workspace_id: WORKSPACE });
    expect(opArgs(call, "order")).toEqual(["created_at", { ascending: false }]);
    expect(opArgs(call, "limit")).toEqual([50]);
  });

  it("returns the newest window oldest-first, ready to render", async () => {
    mock([
      { role: "assistant", content: "newest", follow_up: "next?" },
      { role: "user", content: "oldest", follow_up: null },
    ]);

    await expect(listChatMessages(WORKSPACE)).resolves.toEqual([
      { role: "user", content: "oldest", followUp: null },
      { role: "assistant", content: "newest", followUp: "next?" },
    ]);
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(listChatMessages(WORKSPACE)).rejects.toThrow("denied");
  });
});

describe("appendChatMessage", () => {
  it("writes the turn, defaulting follow_up to null", async () => {
    const supabase = mock(null);

    await appendChatMessage(WORKSPACE, { role: "user", content: "hi" });

    expect(writtenRow(supabase.queries("chat_messages")[0]!)).toEqual({
      workspace_id: WORKSPACE,
      role: "user",
      content: "hi",
      follow_up: null,
    });
  });

  it("carries a follow-up through", async () => {
    const supabase = mock(null);

    await appendChatMessage(WORKSPACE, { role: "assistant", content: "hi", followUp: "and then?" });

    expect(writtenRow(supabase.queries("chat_messages")[0]!)).toMatchObject({ follow_up: "and then?" });
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(appendChatMessage(WORKSPACE, { role: "user", content: "hi" })).rejects.toThrow("denied");
  });
});

describe("recordInterestSignup", () => {
  it("reports a first-time signup as new", async () => {
    const supabase = mock({ id: "signup-1" });

    await expect(recordInterestSignup("founder@example.com")).resolves.toEqual({ isNew: true });
    expect(writtenRow(supabase.queries("interest_signups")[0]!)).toEqual({
      email: "founder@example.com",
    });
  });

  it("uses the admin client, since an anonymous visitor has no session to authorize", async () => {
    mock({ id: "signup-1" });

    await recordInterestSignup("founder@example.com");

    expect(createAdminClient).toHaveBeenCalled();
  });

  it("treats a duplicate address as a non-event, not an error", async () => {
    mock(null, Object.assign(new Error("duplicate key"), { code: "23505" }));

    await expect(recordInterestSignup("founder@example.com")).resolves.toEqual({ isNew: false });
  });

  it("reports isNew false when the insert returned no row", async () => {
    mock(null);

    await expect(recordInterestSignup("founder@example.com")).resolves.toEqual({ isNew: false });
  });

  it("still throws on a failure that is not a duplicate", async () => {
    mock(null, Object.assign(new Error("permission denied"), { code: "42501" }));

    await expect(recordInterestSignup("founder@example.com")).rejects.toThrow("permission denied");
  });
});
