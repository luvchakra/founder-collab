import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, usedOp, writtenRow, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  getOrCreateConversation: vi.fn(),
  markConversationAwaitingReply: vi.fn(),
}));

vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("../conversations/mutations", () => ({
  getOrCreateConversation: h.getOrCreateConversation,
  markConversationAwaitingReply: h.markConversationAwaitingReply,
}));

const { approveMessage, deleteMessage, markMessageSent, updateMessageContact, updateMessageContent } =
  await import("./mutations");

const MESSAGE = { id: "m1", workspace_id: "w1", prospect_id: "p1", contact_id: "c1", channel: "email" };

function mock(responder?: (call: RecordedQuery) => { data: unknown; error: unknown }) {
  const supabase = createFakeSupabase({ query: responder ?? (() => ({ data: MESSAGE, error: null })) });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getOrCreateConversation.mockResolvedValue({ id: "conv-1" });
});

describe("updateMessageContent", () => {
  it("resets an approved message to draft, so an edit needs re-approval", async () => {
    const supabase = mock();

    await updateMessageContent("m1", "  New body  ", "  Subject  ");

    expect(writtenRow(supabase.queries("messages")[0]!)).toEqual({
      content: "New body",
      subject: "Subject",
      status: "draft",
    });
  });

  it("nulls a blank or omitted subject, which only email uses", async () => {
    const supabase = mock();
    await updateMessageContent("m1", "Body", "   ");
    expect(writtenRow(supabase.queries("messages")[0]!)).toMatchObject({ subject: null });

    const other = mock();
    await updateMessageContent("m1", "Body");
    expect(writtenRow(other.queries("messages")[0]!)).toMatchObject({ subject: null });
  });

  it.each([["empty", ""], ["whitespace-only", "   "]])("rejects %s content before writing", async (_l, content) => {
    const supabase = mock();

    await expect(updateMessageContent("m1", content)).rejects.toThrow("Message content is required.");
    expect(supabase.queries()).toEqual([]);
  });

  it("propagates a failure", async () => {
    mock(() => ({ data: null, error: new Error("denied") }));
    await expect(updateMessageContent("m1", "Body")).rejects.toThrow("denied");
  });
});

describe("updateMessageContact / approveMessage", () => {
  it("sets the chosen recipient, allowing null to clear it", async () => {
    const supabase = mock();
    await updateMessageContact("m1", "c2");
    expect(writtenRow(supabase.queries("messages")[0]!)).toEqual({ contact_id: "c2" });

    const cleared = mock();
    await updateMessageContact("m1", null);
    expect(writtenRow(cleared.queries("messages")[0]!)).toEqual({ contact_id: null });
  });

  it("approves without touching anything else", async () => {
    const supabase = mock();

    await approveMessage("m1");

    expect(writtenRow(supabase.queries("messages")[0]!)).toEqual({ status: "approved" });
  });

  it.each([
    ["updateMessageContact", () => updateMessageContact("m1", "c2")],
    ["approveMessage", () => approveMessage("m1")],
  ])("%s propagates a failure", async (_label, run) => {
    mock(() => ({ data: null, error: new Error("denied") }));
    await expect(run()).rejects.toThrow("denied");
  });
});

describe("markMessageSent", () => {
  it("opens or reuses the thread and attaches the message to it", async () => {
    const supabase = mock();

    await markMessageSent("m1");

    expect(h.getOrCreateConversation).toHaveBeenCalledWith("w1", "p1", "c1", "email");
    const update = supabase.queries("messages").find((c) => usedOp(c, "update"))!;
    expect(writtenRow(update)).toMatchObject({ status: "sent", conversation_id: "conv-1" });
    expect(eqFilters(update)).toEqual({ id: "m1" });
  });

  it("stamps a send time", async () => {
    const supabase = mock();

    await markMessageSent("m1");

    const update = supabase.queries("messages").find((c) => usedOp(c, "update"))!;
    expect(writtenRow(update)!.sent_at).toEqual(expect.any(String));
  });

  it("puts the conversation into awaiting_reply", async () => {
    mock();

    await markMessageSent("m1");

    expect(h.markConversationAwaitingReply).toHaveBeenCalledWith("conv-1");
  });

  it("propagates a failed lookup without opening a conversation", async () => {
    mock(() => ({ data: null, error: new Error("not visible") }));

    await expect(markMessageSent("m1")).rejects.toThrow("not visible");
    expect(h.getOrCreateConversation).not.toHaveBeenCalled();
  });

  it("propagates a failure to record the send, leaving the thread un-bumped", async () => {
    mock((call) =>
      usedOp(call, "update")
        ? { data: null, error: new Error("update denied") }
        : { data: { id: "m1", workspace_id: "w1", prospect_id: "p1", contact_id: "c1", channel: "email" }, error: null },
    );

    await expect(markMessageSent("m1")).rejects.toThrow("update denied");
    expect(h.markConversationAwaitingReply).not.toHaveBeenCalled();
  });
});

describe("deleteMessage", () => {
  it("deletes the one message", async () => {
    const supabase = mock(() => ({ data: null, error: null }));

    await deleteMessage("m1");

    const call = supabase.queries("messages")[0]!;
    expect(usedOp(call, "delete")).toBe(true);
    expect(eqFilters(call)).toEqual({ id: "m1" });
  });

  it("propagates a failure", async () => {
    mock(() => ({ data: null, error: new Error("denied") }));
    await expect(deleteMessage("m1")).rejects.toThrow("denied");
  });
});
