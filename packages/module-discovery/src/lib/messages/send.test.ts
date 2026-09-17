/**
 * R1/R2: an outbound message's status must be the provider's *actual* result, never a
 * manual self-report. The tests therefore pin every branch that decides that status, plus
 * the guards in front of the send — sending an unapproved message, or one with no
 * deliverable recipient, would burn a provider call and mislead the founder about what
 * went out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, usedOp, writtenRow, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  listContacts: vi.fn(),
  getProspect: vi.fn(),
  getBusiness: vi.fn(),
  getProduct: vi.fn(),
  getWorkspace: vi.fn(),
  getOrCreateConversation: vi.fn(),
  markConversationAwaitingReply: vi.fn(),
  renderEmailHtml: vi.fn(
    (_input: { brandName: string; body: string; websiteUrl: string | null; replyToEmail: string }) =>
      "<html>body</html>",
  ),
  renderEmailText: vi.fn(() => "body"),
  // Arg typed explicitly: an inferred zero-arg mock gives `mock.calls` an empty tuple
  // type, and the assertions below read the payload it was called with.
  send: vi.fn((_payload: { to: string; subject: string; text: string; html: string }) => undefined as unknown),
  Resend: vi.fn(),
}));

vi.mock("resend", () => ({ Resend: h.Resend }));
vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("../contacts/queries", () => ({ listContacts: h.listContacts }));
vi.mock("../prospects/queries", () => ({ getProspect: h.getProspect }));
vi.mock("../tenancy/queries", () => ({
  getBusiness: h.getBusiness,
  getProduct: h.getProduct,
  getWorkspace: h.getWorkspace,
}));
vi.mock("../conversations/mutations", () => ({
  getOrCreateConversation: h.getOrCreateConversation,
  markConversationAwaitingReply: h.markConversationAwaitingReply,
}));
vi.mock("@cofounderai/core/email/render", () => ({
  renderEmailHtml: h.renderEmailHtml,
  renderEmailText: h.renderEmailText,
}));

const { sendMessage } = await import("./send");

const MESSAGE = {
  id: "m1",
  channel: "email",
  status: "approved",
  workspace_id: "w1",
  prospect_id: "p1",
  contact_id: null,
  subject: null,
  content: "Hello there",
};

function mock(message: unknown = MESSAGE, error: unknown = null) {
  const supabase = createFakeSupabase({
    query: (call: RecordedQuery) =>
      error ? { data: null, error } : { data: usedOp(call, "update") ? { id: "m1", updated: true } : message, error: null },
  });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getProspect.mockResolvedValue({ id: "p1", company_name: "Acme" });
  h.listContacts.mockResolvedValue([{ id: "c1", email: "buyer@acme.com" }]);
  h.getWorkspace.mockResolvedValue({ id: "w1", product_id: "prod-1" });
  h.getProduct.mockResolvedValue({ id: "prod-1", name: "Widgets", business_id: "b1", website: "https://widgets.example" });
  h.getBusiness.mockResolvedValue({ id: "b1", name: "Acme Co", website: null });
  h.getOrCreateConversation.mockResolvedValue({ id: "conv-1" });
  h.send.mockResolvedValue({ data: { id: "resend-1" }, error: null });
  h.Resend.mockImplementation(
    class {
      emails = { send: h.send };
    } as unknown as (...args: unknown[]) => unknown,
  );
  vi.stubEnv("RESEND_API_KEY", "re_key");
  vi.stubEnv("RESEND_FROM_EMAIL", "founder@widgets.example");
});

afterEach(() => vi.unstubAllEnvs());

describe("sendMessage — guards", () => {
  it.each(["linkedin", "whatsapp"])("refuses the %s channel, which has no send integration", async (channel) => {
    mock({ ...MESSAGE, channel });

    await expect(sendMessage("m1")).rejects.toThrow(/only available for the email channel/);
    expect(h.send).not.toHaveBeenCalled();
  });

  it.each(["draft", "sent"])("refuses a '%s' message — only approved or failed may send", async (status) => {
    mock({ ...MESSAGE, status });

    await expect(sendMessage("m1")).rejects.toThrow("Approve the message before sending.");
    expect(h.send).not.toHaveBeenCalled();
  });

  it("allows retrying a previously failed message", async () => {
    mock({ ...MESSAGE, status: "failed" });

    await sendMessage("m1");

    expect(h.send).toHaveBeenCalled();
  });

  it("refuses when the prospect is not visible", async () => {
    mock();
    h.getProspect.mockResolvedValue(null);

    await expect(sendMessage("m1")).rejects.toThrow("Prospect not found.");
  });

  it("refuses when no contact has an email", async () => {
    mock();
    h.listContacts.mockResolvedValue([{ id: "c1", email: null }]);

    await expect(sendMessage("m1")).rejects.toThrow(/No contact email on file/);
    expect(h.send).not.toHaveBeenCalled();
  });

  it.each([
    ["no API key", "RESEND_API_KEY"],
    ["no from address", "RESEND_FROM_EMAIL"],
  ])("refuses with %s configured, rather than failing mid-send", async (_label, missing) => {
    mock();
    vi.stubEnv(missing, "");

    await expect(sendMessage("m1")).rejects.toThrow(/isn't configured/);
    expect(h.send).not.toHaveBeenCalled();
  });
});

describe("sendMessage — recipient selection", () => {
  it("sends to the message's chosen contact when one is set", async () => {
    mock({ ...MESSAGE, contact_id: "c2" });
    h.listContacts.mockResolvedValue([
      { id: "c1", email: "first@acme.com" },
      { id: "c2", email: "chosen@acme.com" },
    ]);

    await sendMessage("m1");

    expect(h.send.mock.calls[0]![0].to).toBe("chosen@acme.com");
  });

  it("falls back to the first contact with an email when none is chosen", async () => {
    mock();
    h.listContacts.mockResolvedValue([
      { id: "c1", email: null },
      { id: "c2", email: "second@acme.com" },
    ]);

    await sendMessage("m1");

    expect(h.send.mock.calls[0]![0].to).toBe("second@acme.com");
  });

  it("refuses when the chosen contact has no email, rather than silently using another", async () => {
    mock({ ...MESSAGE, contact_id: "c1" });
    h.listContacts.mockResolvedValue([
      { id: "c1", email: null },
      { id: "c2", email: "other@acme.com" },
    ]);

    await expect(sendMessage("m1")).rejects.toThrow(/No contact email on file/);
  });
});

describe("sendMessage — composition", () => {
  it("brands the email with the product, falling back to business then prospect", async () => {
    mock();
    await sendMessage("m1");
    expect(h.renderEmailHtml.mock.calls[0]![0]).toMatchObject({ brandName: "Widgets" });

    h.renderEmailHtml.mockClear();
    h.getProduct.mockResolvedValue(null);
    mock();
    await sendMessage("m1");
    expect(h.renderEmailHtml.mock.calls[0]![0]).toMatchObject({ brandName: "Acme" });
  });

  it("defaults the subject when the message has none", async () => {
    mock();

    await sendMessage("m1");

    expect(h.send.mock.calls[0]![0].subject).toBe("Quick note for Acme");
  });

  it("uses the message's own subject when set", async () => {
    mock({ ...MESSAGE, subject: "About your ops" });

    await sendMessage("m1");

    expect(h.send.mock.calls[0]![0].subject).toBe("About your ops");
  });

  it("sends both a text and an HTML part, replying to the configured address", async () => {
    mock();

    await sendMessage("m1");

    expect(h.send.mock.calls[0]![0]).toMatchObject({ text: "body", html: "<html>body</html>" });
    expect(h.renderEmailHtml.mock.calls[0]![0]).toMatchObject({
      replyToEmail: "founder@widgets.example",
    });
  });
});

describe("sendMessage — outcome", () => {
  it("records the provider's message id and marks it sent", async () => {
    const supabase = mock();

    await sendMessage("m1");

    const update = supabase.queries("messages").find((c) => usedOp(c, "update"))!;
    expect(writtenRow(update)).toMatchObject({
      status: "sent",
      conversation_id: "conv-1",
      provider_message_id: "resend-1",
      failure_reason: null,
    });
  });

  it("marks the conversation awaiting a reply after a successful send", async () => {
    mock();

    await sendMessage("m1");

    expect(h.markConversationAwaitingReply).toHaveBeenCalledWith("conv-1");
  });

  it("records the provider's own failure reason rather than a generic one", async () => {
    const supabase = mock();
    h.send.mockResolvedValue({ data: null, error: { message: "domain not verified" } });

    await sendMessage("m1");

    const update = supabase.queries("messages").find((c) => usedOp(c, "update"))!;
    expect(writtenRow(update)).toEqual({ status: "failed", failure_reason: "domain not verified" });
  });

  it("opens no conversation for a send that failed", async () => {
    mock();
    h.send.mockResolvedValue({ data: null, error: { message: "bounced" } });

    await sendMessage("m1");

    expect(h.getOrCreateConversation).not.toHaveBeenCalled();
    expect(h.markConversationAwaitingReply).not.toHaveBeenCalled();
  });

  it("tolerates a provider response with no message id", async () => {
    const supabase = mock();
    h.send.mockResolvedValue({ data: null, error: null });

    await sendMessage("m1");

    const update = supabase.queries("messages").find((c) => usedOp(c, "update"))!;
    expect(writtenRow(update)).toMatchObject({ status: "sent", provider_message_id: null });
  });

  it("propagates a failed message lookup", async () => {
    mock(MESSAGE, new Error("not visible"));

    await expect(sendMessage("m1")).rejects.toThrow("not visible");
  });
});
