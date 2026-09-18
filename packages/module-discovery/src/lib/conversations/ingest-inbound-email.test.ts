/**
 * Inbound replies are matched to a contact by "from" address alone — there is no
 * Message-ID we control to thread on. The invariants that keeps safe: matching is
 * case-insensitive on a trimmed address, an unmatched sender is a *result* rather than a
 * throw (the webhook turns a throw into a status the provider retries forever), a second
 * conversation is never opened while one is still open, and a classification failure
 * never loses the reply that was already stored.
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

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
const { classifyReply } = vi.hoisted(() => ({ classifyReply: vi.fn() }));
vi.mock("../../db/admin", () => ({ createAdminClient }));
vi.mock("../ai/classify-reply", () => ({ classifyReply }));

const { ingestInboundEmail } = await import("./ingest-inbound-email");

const CONTACT = { id: "c1", workspace_id: "w1", prospect_id: "p1" };
const PAYLOAD = { from: "prospect@example.com", subject: "Re: hello", text: "Sounds good" };

/** `conversation` is what the open-conversation lookup finds (null → a new one is opened). */
function mockAdmin({
  contact = CONTACT as unknown,
  conversation = { id: "conv-1" } as unknown,
  message = { id: "m1" } as unknown,
}: { contact?: unknown; conversation?: unknown; message?: unknown } = {}) {
  const supabase = createFakeSupabase({
    query: (call: RecordedQuery) => {
      if (call.table === "contacts") return { data: contact, error: null };
      if (call.table === "conversations") {
        if (usedOp(call, "insert")) return { data: { id: "conv-new" }, error: null };
        if (usedOp(call, "update")) return { data: null, error: null };
        return { data: conversation, error: null };
      }
      if (call.table === "messages") return { data: message, error: null };
      return { data: null, error: null };
    },
  });
  createAdminClient.mockReturnValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
  classifyReply.mockResolvedValue({ id: "m1", classified: true });
});

describe("ingestInboundEmail", () => {
  it("appends the reply to the contact's open conversation", async () => {
    const supabase = mockAdmin();

    const result = await ingestInboundEmail(PAYLOAD);

    expect(result.matched).toBe(true);
    expect(writtenRow(supabase.queries("messages")[0]!)).toMatchObject({
      workspace_id: "w1",
      prospect_id: "p1",
      contact_id: "c1",
      conversation_id: "conv-1",
      channel: "email",
      direction: "inbound",
      status: "sent",
    });
  });

  it("matches the sender case-insensitively on a trimmed address", async () => {
    const supabase = mockAdmin();

    await ingestInboundEmail({ ...PAYLOAD, from: "  PROSPECT@Example.COM  " });

    expect(opArgs(supabase.queries("contacts")[0]!, "ilike")).toEqual([
      "email",
      "prospect@example.com",
    ]);
  });

  it("prefixes the subject onto the body when there is one", async () => {
    const supabase = mockAdmin();

    await ingestInboundEmail(PAYLOAD);

    expect(writtenRow(supabase.queries("messages")[0]!)).toMatchObject({
      content: "Subject: Re: hello\n\nSounds good",
    });
  });

  it.each([
    ["no subject field", undefined],
    ["a null subject", null],
    ["an empty subject", ""],
  ])("stores the body alone given %s", async (_label, subject) => {
    const supabase = mockAdmin();

    await ingestInboundEmail({ ...PAYLOAD, subject });

    expect(writtenRow(supabase.queries("messages")[0]!)).toMatchObject({ content: "Sounds good" });
  });

  it("looks for an open email conversation on the prospect, excluding closed ones", async () => {
    const supabase = mockAdmin();

    await ingestInboundEmail(PAYLOAD);

    const lookup = supabase.queries("conversations")[0]!;
    expect(eqFilters(lookup)).toEqual({ prospect_id: "p1", channel: "email" });
    expect(opArgs(lookup, "neq")).toEqual(["status", "closed"]);
  });

  it("does not open a second conversation when one is already open", async () => {
    const supabase = mockAdmin();

    await ingestInboundEmail(PAYLOAD);

    expect(supabase.queries("conversations").filter((c) => usedOp(c, "insert"))).toEqual([]);
  });

  it("opens a conversation, scoped to the contact's own workspace, when none is open", async () => {
    const supabase = mockAdmin({ conversation: null });

    await ingestInboundEmail(PAYLOAD);

    const insert = supabase.queries("conversations").find((c) => usedOp(c, "insert"))!;
    expect(writtenRow(insert)).toEqual({
      workspace_id: "w1",
      prospect_id: "p1",
      contact_id: "c1",
      channel: "email",
    });
  });

  it("attaches the message to the conversation it just opened", async () => {
    const supabase = mockAdmin({ conversation: null });

    await ingestInboundEmail(PAYLOAD);

    expect(writtenRow(supabase.queries("messages")[0]!)).toMatchObject({ conversation_id: "conv-new" });
  });

  it("marks the conversation replied and bumps its last-message time", async () => {
    const supabase = mockAdmin();

    await ingestInboundEmail(PAYLOAD);

    const update = supabase.queries("conversations").find((c) => usedOp(c, "update"))!;
    expect(writtenRow(update)).toMatchObject({ status: "replied" });
    expect(writtenRow(update)!.last_message_at).toEqual(expect.any(String));
    expect(eqFilters(update)).toEqual({ id: "conv-1" });
  });

  it("returns the classified message when classification succeeds", async () => {
    mockAdmin();

    const result = await ingestInboundEmail(PAYLOAD);

    expect(classifyReply).toHaveBeenCalledWith("m1");
    expect(result).toMatchObject({ matched: true, message: { classified: true } });
  });

  it("still returns the stored reply when classification fails", async () => {
    mockAdmin();
    classifyReply.mockRejectedValue(new Error("rate limited"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await ingestInboundEmail(PAYLOAD);

    expect(result).toMatchObject({ matched: true, message: { id: "m1" } });
    consoleError.mockRestore();
  });

  it.each([
    ["an empty address", ""],
    ["a whitespace-only address", "   "],
  ])("reports %s as unmatched without querying anything", async (_label, from) => {
    const supabase = mockAdmin();

    expect(await ingestInboundEmail({ ...PAYLOAD, from })).toEqual({
      matched: false,
      reason: "Missing sender address.",
    });
    expect(supabase.queries()).toEqual([]);
  });

  it("reports an unknown sender as unmatched rather than throwing", async () => {
    mockAdmin({ contact: null });

    expect(await ingestInboundEmail(PAYLOAD)).toEqual({
      matched: false,
      reason: "No contact found for prospect@example.com.",
    });
  });

  it("stores nothing when the contact lookup itself fails", async () => {
    const supabase = createFakeSupabase({ query: () => ({ data: null, error: new Error("select denied") }) });
    createAdminClient.mockReturnValue(supabase);

    await expect(ingestInboundEmail(PAYLOAD)).rejects.toThrow("select denied");
    expect(supabase.queries("messages")).toEqual([]);
  });

  it("uses the admin client, since a webhook has no signed-in user", async () => {
    mockAdmin();

    await ingestInboundEmail(PAYLOAD);

    expect(createAdminClient).toHaveBeenCalled();
  });

  /**
   * Each write in the chain is followed by its own error check. They matter individually:
   * the webhook's caller turns a throw into a retry, so a swallowed failure here would
   * either drop a real reply or leave a conversation that says "awaiting reply" after the
   * prospect already answered.
   */
  it("propagates a failure to look up the open conversation", async () => {
    const supabase = createFakeSupabase({
      query: (call: RecordedQuery) =>
        call.table === "contacts"
          ? { data: CONTACT, error: null }
          : { data: null, error: new Error("conversation lookup failed") },
    });
    createAdminClient.mockReturnValue(supabase);

    await expect(ingestInboundEmail(PAYLOAD)).rejects.toThrow("conversation lookup failed");
    expect(supabase.queries("messages")).toEqual([]);
  });

  it("propagates a failure to open a new conversation", async () => {
    const supabase = createFakeSupabase({
      query: (call: RecordedQuery) => {
        if (call.table === "contacts") return { data: CONTACT, error: null };
        if (usedOp(call, "insert")) return { data: null, error: new Error("insert denied") };
        return { data: null, error: null };
      },
    });
    createAdminClient.mockReturnValue(supabase);

    await expect(ingestInboundEmail(PAYLOAD)).rejects.toThrow("insert denied");
    expect(supabase.queries("messages")).toEqual([]);
  });

  it("propagates a failure to store the reply", async () => {
    const supabase = createFakeSupabase({
      query: (call: RecordedQuery) => {
        if (call.table === "contacts") return { data: CONTACT, error: null };
        if (call.table === "messages") return { data: null, error: new Error("message insert failed") };
        return { data: { id: "conv-1" }, error: null };
      },
    });
    createAdminClient.mockReturnValue(supabase);

    await expect(ingestInboundEmail(PAYLOAD)).rejects.toThrow("message insert failed");
    expect(classifyReply).not.toHaveBeenCalled();
  });

  it("propagates a failure to mark the conversation replied", async () => {
    const supabase = createFakeSupabase({
      query: (call: RecordedQuery) => {
        if (call.table === "contacts") return { data: CONTACT, error: null };
        if (call.table === "messages") return { data: { id: "m1" }, error: null };
        if (usedOp(call, "update")) return { data: null, error: new Error("update denied") };
        return { data: { id: "conv-1" }, error: null };
      },
    });
    createAdminClient.mockReturnValue(supabase);

    await expect(ingestInboundEmail(PAYLOAD)).rejects.toThrow("update denied");
    expect(classifyReply).not.toHaveBeenCalled();
  });
});
