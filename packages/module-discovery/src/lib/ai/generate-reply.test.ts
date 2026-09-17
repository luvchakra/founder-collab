/**
 * Reply drafting requires the inbound message to already be classified, so the draft
 * follows a concrete recommended_action rather than guessing at intent — and, like
 * generateOutreachMessage, it only ever produces a draft (blueprint §20's approval gate).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, opArgs, usedOp, writtenRow } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  getConversation: vi.fn(),
  getProspect: vi.fn(),
  getWorkspace: vi.fn(),
  getProduct: vi.fn(),
  generateObject: vi.fn(),
  recordAiRun: vi.fn(),
  assertWithinUsageLimit: vi.fn(),
  resolveAiModel: vi.fn(),
  toAiProviderError: vi.fn(),
}));

vi.mock("ai", () => ({ generateObject: h.generateObject }));
vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("../conversations/queries", () => ({ getConversation: h.getConversation }));
vi.mock("../prospects/queries", () => ({ getProspect: h.getProspect }));
vi.mock("../tenancy/queries", () => ({ getWorkspace: h.getWorkspace, getProduct: h.getProduct }));
vi.mock("./usage", () => ({ recordAiRun: h.recordAiRun }));
vi.mock("../usage/limits", () => ({ assertWithinUsageLimit: h.assertWithinUsageLimit }));
vi.mock("./router", () => ({ resolveAiModel: h.resolveAiModel, toAiProviderError: h.toAiProviderError }));

const { generateReply } = await import("./generate-reply");

const CONVERSATION = {
  id: "conv-1",
  workspace_id: "w1",
  prospect_id: "p1",
  contact_id: null,
  channel: "email",
};
const INBOUND = {
  id: "m1",
  direction: "inbound",
  content: "Sounds interesting",
  classification: "interested",
  recommended_action: "Book a call",
};
const DRAFT = { subject: "Re: hello", content: "Happy to talk" };

/** `inbound` is what the latest-inbound lookup finds. */
function mockDb(options: { inbound?: unknown; contact?: unknown; error?: unknown } = {}) {
  const supabase = createFakeSupabase({
    query: (call) => {
      if (options.error) return { data: null, error: options.error };
      if (call.table === "contacts") return { data: options.contact ?? null, error: null };
      if (call.table === "messages") {
        return usedOp(call, "insert")
          ? { data: { id: "m2", ...DRAFT }, error: null }
          : { data: "inbound" in options ? options.inbound : INBOUND, error: null };
      }
      return { data: null, error: null };
    },
  });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getConversation.mockResolvedValue(CONVERSATION);
  h.getProspect.mockResolvedValue({ id: "p1", workspace_id: "w1", company_name: "Acme" });
  h.getWorkspace.mockResolvedValue({ id: "w1", product_id: "prod-1" });
  h.getProduct.mockResolvedValue({ id: "prod-1", name: "Widgets", product_profile: { category: "B2B" } });
  h.assertWithinUsageLimit.mockResolvedValue(undefined);
  h.resolveAiModel.mockResolvedValue({
    accountId: "acct-1",
    provider: "anthropic",
    modelId: "claude-x",
    model: { id: "claude-x" },
  });
  h.generateObject.mockResolvedValue({ object: DRAFT, usage: { inputTokens: 30, outputTokens: 15 } });
  h.toAiProviderError.mockImplementation(() => Object.assign(new Error("normalized"), { code: "unknown" }));
});

describe("generateReply — guards", () => {
  it("refuses a conversation that is not visible", async () => {
    mockDb();
    h.getConversation.mockResolvedValue(null);

    await expect(generateReply("conv-1")).rejects.toThrow("Conversation not found.");
  });

  it("refuses when there is nothing to reply to", async () => {
    mockDb({ inbound: null });

    await expect(generateReply("conv-1")).rejects.toThrow("No inbound reply to respond to yet.");
    expect(h.generateObject).not.toHaveBeenCalled();
  });

  it("refuses an unclassified reply, so the draft follows a real recommended action", async () => {
    mockDb({ inbound: { ...INBOUND, classification: null } });

    await expect(generateReply("conv-1")).rejects.toThrow(
      "Classify the latest reply before generating a response.",
    );
    expect(h.generateObject).not.toHaveBeenCalled();
  });

  it.each([
    ["the prospect is not visible", () => h.getProspect.mockResolvedValue(null), "Prospect not found."],
    ["the workspace is not visible", () => h.getWorkspace.mockResolvedValue(null), "Workspace not found."],
    ["the product has no profile", () => h.getProduct.mockResolvedValue({ name: "W", product_profile: null }), "Product profile not found."],
  ])("refuses when %s", async (_label, arrange, message) => {
    mockDb();
    arrange();

    await expect(generateReply("conv-1")).rejects.toThrow(message);
  });

  it("propagates a failed inbound lookup", async () => {
    mockDb({ error: new Error("select denied") });

    await expect(generateReply("conv-1")).rejects.toThrow("select denied");
  });
});

describe("generateReply — the inbound it answers", () => {
  it("takes the newest inbound message in this conversation", async () => {
    const supabase = mockDb();

    await generateReply("conv-1");

    const lookup = supabase.queries("messages")[0]!;
    expect(eqFilters(lookup)).toEqual({ conversation_id: "conv-1", direction: "inbound" });
    expect(opArgs(lookup, "order")).toEqual(["created_at", { ascending: false }]);
    expect(opArgs(lookup, "limit")).toEqual([1]);
  });

  it("loads the conversation's contact when it has one", async () => {
    const supabase = mockDb({ contact: { id: "c1" } });
    h.getConversation.mockResolvedValue({ ...CONVERSATION, contact_id: "c1" });

    await generateReply("conv-1");

    expect(eqFilters(supabase.queries("contacts")[0]!)).toEqual({ id: "c1" });
  });
});

describe("generateReply — outcome", () => {
  it("creates the reply as a draft in the same conversation", async () => {
    const supabase = mockDb();

    await generateReply("conv-1");

    const insert = supabase.queries("messages").find((c) => usedOp(c, "insert"))!;
    expect(writtenRow(insert)).toMatchObject({
      status: "draft",
      conversation_id: "conv-1",
      prospect_id: "p1",
      channel: "email",
    });
  });

  it("records a succeeded ledger row", async () => {
    mockDb();

    await generateReply("conv-1");

    expect(h.recordAiRun).toHaveBeenCalledWith(expect.objectContaining({ status: "succeeded" }));
  });

  it("normalizes a provider failure and writes no draft", async () => {
    const supabase = mockDb();
    h.generateObject.mockRejectedValue(new Error("boom"));

    await expect(generateReply("conv-1")).rejects.toThrow("normalized");
    expect(supabase.queries("messages").filter((c) => usedOp(c, "insert"))).toEqual([]);
  });

  it("prompts for a generic response when the reply carried no recommended action", async () => {
    mockDb({ inbound: { ...INBOUND, recommended_action: null } });

    await generateReply("conv-1");

    expect(String(h.generateObject.mock.calls[0]![0].prompt)).toContain("Respond appropriately.");
  });

  it("propagates a failure to persist the drafted reply", async () => {
    mockDb({ error: new Error("insert denied") });

    await expect(generateReply("conv-1")).rejects.toThrow();
  });
});
