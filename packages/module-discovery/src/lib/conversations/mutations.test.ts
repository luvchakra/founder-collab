/**
 * Conversation state is blueprint §21's machine. Two rules carry weight: a thread is
 * created lazily, so there is never an empty conversation; and a manually logged reply
 * must be indistinguishable from a webhook-ingested one afterwards — same shape, same
 * best-effort classification, so "Generate reply" unblocks either way.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, usedOp, writtenRow } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  classifyReply: vi.fn(),
  getConversation: vi.fn(),
  getOpenConversation: vi.fn(),
}));

vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("../ai/classify-reply", () => ({ classifyReply: h.classifyReply }));
vi.mock("./queries", () => ({
  getConversation: h.getConversation,
  getOpenConversation: h.getOpenConversation,
}));

const {
  closeConversation,
  getOrCreateConversation,
  logInboundReply,
  markConversationAwaitingReply,
  markConversationReplied,
} = await import("./mutations");

const CONVERSATION = {
  id: "conv-1",
  workspace_id: "w1",
  prospect_id: "p1",
  contact_id: "c1",
  channel: "email",
};

function mock(data: unknown = { id: "row" }, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data, error }) });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getOpenConversation.mockResolvedValue(null);
  h.getConversation.mockResolvedValue(CONVERSATION);
  h.classifyReply.mockResolvedValue({ id: "m1", classification: "interested" });
});

describe("getOrCreateConversation", () => {
  it("reuses an open conversation rather than opening a second", async () => {
    const supabase = mock();
    h.getOpenConversation.mockResolvedValue(CONVERSATION);

    await expect(getOrCreateConversation("w1", "p1", "c1", "email")).resolves.toBe(CONVERSATION);
    expect(supabase.queries()).toEqual([]);
  });

  it("opens one lazily when none is open", async () => {
    const supabase = mock(CONVERSATION);

    await getOrCreateConversation("w1", "p1", "c1", "email");

    expect(writtenRow(supabase.queries("conversations")[0]!)).toEqual({
      workspace_id: "w1",
      prospect_id: "p1",
      contact_id: "c1",
      channel: "email",
    });
  });

  it("accepts a null contact", async () => {
    const supabase = mock(CONVERSATION);

    await getOrCreateConversation("w1", "p1", null, "linkedin");

    expect(writtenRow(supabase.queries("conversations")[0]!)).toMatchObject({
      contact_id: null,
      channel: "linkedin",
    });
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(getOrCreateConversation("w1", "p1", null, "email")).rejects.toThrow("denied");
  });
});

describe("status transitions", () => {
  it.each([
    ["markConversationReplied", () => markConversationReplied("conv-1"), "replied", true],
    ["markConversationAwaitingReply", () => markConversationAwaitingReply("conv-1"), "awaiting_reply", true],
    ["closeConversation", () => closeConversation("conv-1"), "closed", false],
  ])("%s sets status '%s'", async (_label, run, status, bumpsTimestamp) => {
    const supabase = mock(CONVERSATION);

    await run();

    const call = supabase.queries("conversations")[0]!;
    expect(writtenRow(call)).toMatchObject({ status });
    expect(eqFilters(call)).toEqual({ id: "conv-1" });
    expect("last_message_at" in writtenRow(call)!).toBe(bumpsTimestamp);
  });

  it.each([
    ["markConversationReplied", () => markConversationReplied("conv-1")],
    ["markConversationAwaitingReply", () => markConversationAwaitingReply("conv-1")],
    ["closeConversation", () => closeConversation("conv-1")],
  ])("%s propagates a failure", async (_label, run) => {
    mock(null, new Error("denied"));
    await expect(run()).rejects.toThrow("denied");
  });
});

describe("logInboundReply", () => {
  it("records the reply in the same shape the webhook produces", async () => {
    const supabase = mock({ id: "m1" });

    await logInboundReply("conv-1", "  They replied  ");

    expect(writtenRow(supabase.queries("messages")[0]!)).toMatchObject({
      workspace_id: "w1",
      prospect_id: "p1",
      contact_id: "c1",
      conversation_id: "conv-1",
      channel: "email",
      direction: "inbound",
      content: "They replied",
      status: "sent",
    });
  });

  it("moves the conversation to replied", async () => {
    const supabase = mock({ id: "m1" });

    await logInboundReply("conv-1", "They replied");

    const update = supabase.queries("conversations").find((c) => usedOp(c, "update"))!;
    expect(writtenRow(update)).toMatchObject({ status: "replied" });
  });

  it("classifies the reply, returning the classified message", async () => {
    mock({ id: "m1" });

    await expect(logInboundReply("conv-1", "They replied")).resolves.toMatchObject({
      classification: "interested",
    });
    expect(h.classifyReply).toHaveBeenCalledWith("m1");
  });

  it("keeps the reply when classification fails — best-effort, same as the webhook", async () => {
    mock({ id: "m1" });
    h.classifyReply.mockRejectedValue(new Error("rate limited"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await expect(logInboundReply("conv-1", "They replied")).resolves.toMatchObject({ id: "m1" });
    } finally {
      consoleError.mockRestore();
    }
  });

  it.each([["empty content", ""], ["whitespace-only content", "   "]])(
    "rejects %s before writing",
    async (_label, content) => {
      const supabase = mock({ id: "m1" });

      await expect(logInboundReply("conv-1", content)).rejects.toThrow("Reply content is required.");
      expect(supabase.queries()).toEqual([]);
    },
  );

  it("refuses a conversation that is not visible", async () => {
    mock({ id: "m1" });
    h.getConversation.mockResolvedValue(null);

    await expect(logInboundReply("conv-1", "hi")).rejects.toThrow("Conversation not found.");
  });

  it("propagates a failed insert", async () => {
    mock(null, new Error("denied"));
    await expect(logInboundReply("conv-1", "hi")).rejects.toThrow("denied");
  });
});
