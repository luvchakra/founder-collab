/**
 * The header assistant. Two things here are easy to get subtly wrong and expensive when
 * you do: which workspace a conversation is attributed to (the ai_runs entry, the usage
 * check and the persisted history must all agree, and a chat opened from a business page
 * must never persist under a *different* business's workspace), and which turns get
 * written — only the new user turn and the reply, never the whole transcript the client
 * is holding, or reloading history and replying would double every prior turn.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getBusiness: vi.fn(),
  getCurrentAccount: vi.fn(),
  getFirstWorkspaceForAccount: vi.fn(),
  getFirstWorkspaceForBusiness: vi.fn(),
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  listBusinesses: vi.fn(),
  listProducts: vi.fn(),
  listWorkspacesForProducts: vi.fn(),
  getIcpProfile: vi.fn(),
  getProspectCountsForWorkspaces: vi.fn(),
  listProspects: vi.fn(),
  assertWithinUsageLimit: vi.fn(),
  appendChatMessage: vi.fn(),
  listChatMessages: vi.fn(),
  recordAiRun: vi.fn(),
  resolveAiModel: vi.fn(),
  toAiProviderError: vi.fn(),
  generateObject: vi.fn(),
}));

vi.mock("ai", () => ({ generateObject: h.generateObject }));
vi.mock("../tenancy/queries", () => ({
  getBusiness: h.getBusiness,
  getCurrentAccount: h.getCurrentAccount,
  getFirstWorkspaceForAccount: h.getFirstWorkspaceForAccount,
  getFirstWorkspaceForBusiness: h.getFirstWorkspaceForBusiness,
  getProduct: h.getProduct,
  getWorkspaceForProduct: h.getWorkspaceForProduct,
  listBusinesses: h.listBusinesses,
  listProducts: h.listProducts,
  listWorkspacesForProducts: h.listWorkspacesForProducts,
}));
vi.mock("../icp/queries", () => ({ getIcpProfile: h.getIcpProfile }));
vi.mock("../prospects/queries", () => ({
  getProspectCountsForWorkspaces: h.getProspectCountsForWorkspaces,
  listProspects: h.listProspects,
}));
vi.mock("../usage/limits", () => ({ assertWithinUsageLimit: h.assertWithinUsageLimit }));
vi.mock("../chat/queries", () => ({
  appendChatMessage: h.appendChatMessage,
  listChatMessages: h.listChatMessages,
}));
vi.mock("./usage", () => ({ recordAiRun: h.recordAiRun }));
vi.mock("./router", async () => {
  const actual = await vi.importActual<typeof import("./router")>("./router");
  return {
    AiProviderError: actual.AiProviderError,
    resolveAiModel: h.resolveAiModel,
    toAiProviderError: h.toAiProviderError,
  };
});

const { getChatPanelData, sendChatMessage } = await import("./chat");

const REPLY = { answer: "Here's what to do", followUp: "Want me to draft it?" };
const NO_CONTEXT = { businessId: null, productId: null };

beforeEach(() => {
  vi.clearAllMocks();
  h.getCurrentAccount.mockResolvedValue({ id: "acct-1" });
  h.listBusinesses.mockResolvedValue([{ id: "biz-1", name: "Acme Co" }]);
  h.listProducts.mockResolvedValue([{ id: "prod-1", name: "Widgets" }]);
  h.listWorkspacesForProducts.mockResolvedValue([{ id: "w1", product_id: "prod-1" }]);
  h.getProspectCountsForWorkspaces.mockResolvedValue({ w1: { total: 5, new: 5, qualified: 0, disqualified: 0 } });
  h.getFirstWorkspaceForAccount.mockResolvedValue({ id: "w-account" });
  h.getFirstWorkspaceForBusiness.mockResolvedValue({ id: "w-business" });
  h.getWorkspaceForProduct.mockResolvedValue({ id: "w-product" });
  h.getBusiness.mockResolvedValue({ id: "biz-1", name: "Acme Co" });
  h.getProduct.mockResolvedValue({ id: "prod-1", name: "Widgets", business_id: "biz-1", product_profile: {} });
  h.getIcpProfile.mockResolvedValue({ status: "approved" });
  h.listProspects.mockResolvedValue([]);
  h.listChatMessages.mockResolvedValue([]);
  h.assertWithinUsageLimit.mockResolvedValue(undefined);
  h.appendChatMessage.mockResolvedValue(undefined);
  h.resolveAiModel.mockResolvedValue({
    accountId: "acct-1",
    provider: "anthropic",
    modelId: "claude-x",
    model: { id: "claude-x" },
  });
  h.generateObject.mockResolvedValue({ object: REPLY, usage: { inputTokens: 100, outputTokens: 50 } });
  h.toAiProviderError.mockImplementation(() => Object.assign(new Error("normalized"), { code: "unknown" }));
});

describe("getChatPanelData", () => {
  it("returns nothing for a signed-out visitor", async () => {
    h.getCurrentAccount.mockResolvedValue(null);

    await expect(getChatPanelData(NO_CONTEXT)).resolves.toEqual({
      messages: [],
      followUp: null,
      starterQuestions: [],
    });
  });

  it("returns starter questions but no history when the account has no workspace yet", async () => {
    h.getFirstWorkspaceForAccount.mockResolvedValue(null);
    h.listBusinesses.mockResolvedValue([]);

    const data = await getChatPanelData(NO_CONTEXT);

    expect(data.messages).toEqual([]);
    expect(data.starterQuestions.length).toBeGreaterThan(0);
  });

  it("loads the workspace's persisted history", async () => {
    h.listChatMessages.mockResolvedValue([
      { role: "user", content: "hi", followUp: null },
      { role: "assistant", content: "hello", followUp: "want more?" },
    ]);

    const data = await getChatPanelData(NO_CONTEXT);

    expect(data.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("surfaces the last assistant turn's follow-up, not an earlier one", async () => {
    h.listChatMessages.mockResolvedValue([
      { role: "assistant", content: "a", followUp: "old" },
      { role: "user", content: "b", followUp: null },
      { role: "assistant", content: "c", followUp: "newest" },
    ]);

    await expect(getChatPanelData(NO_CONTEXT)).resolves.toMatchObject({ followUp: "newest" });
  });

  it("reports no follow-up when the thread ends on a user turn's history", async () => {
    h.listChatMessages.mockResolvedValue([{ role: "user", content: "b", followUp: null }]);

    await expect(getChatPanelData(NO_CONTEXT)).resolves.toMatchObject({ followUp: null });
  });
});

describe("sendChatMessage — workspace attribution", () => {
  it("uses the product's own workspace when a product is in view", async () => {
    await sendChatMessage([{ role: "user", content: "hi" }], { businessId: "biz-1", productId: "prod-1" });

    expect(h.appendChatMessage).toHaveBeenCalledWith("w-product", expect.anything());
    expect(h.assertWithinUsageLimit).toHaveBeenCalledWith("w-product");
    expect(h.resolveAiModel).toHaveBeenCalledWith("w-product", "chat");
  });

  it("uses that business's own first workspace when only a business is in view", async () => {
    await sendChatMessage([{ role: "user", content: "hi" }], { businessId: "biz-1", productId: null });

    expect(h.getFirstWorkspaceForBusiness).toHaveBeenCalledWith("biz-1");
    expect(h.appendChatMessage).toHaveBeenCalledWith("w-business", expect.anything());
  });

  it("falls back to the account's first workspace with nothing in view", async () => {
    await sendChatMessage([{ role: "user", content: "hi" }], NO_CONTEXT);

    expect(h.appendChatMessage).toHaveBeenCalledWith("w-account", expect.anything());
  });

  it("attributes the ledger entry to the same workspace as the history", async () => {
    await sendChatMessage([{ role: "user", content: "hi" }], NO_CONTEXT);

    expect(h.recordAiRun).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: "w-account" }));
  });

  it("refuses for a signed-out visitor", async () => {
    h.getCurrentAccount.mockResolvedValue(null);

    await expect(sendChatMessage([{ role: "user", content: "hi" }], NO_CONTEXT)).rejects.toMatchObject({
      code: "no_provider_connected",
    });
  });

  it("refuses before there is any workspace to attribute the run to", async () => {
    h.getFirstWorkspaceForAccount.mockResolvedValue(null);
    h.listBusinesses.mockResolvedValue([]);

    await expect(sendChatMessage([{ role: "user", content: "hi" }], NO_CONTEXT)).rejects.toThrow(
      /Create a business and product/,
    );
    expect(h.generateObject).not.toHaveBeenCalled();
  });

  it("checks the spend cap before resolving a model", async () => {
    h.assertWithinUsageLimit.mockRejectedValue(new Error("allowance"));

    await expect(sendChatMessage([{ role: "user", content: "hi" }], NO_CONTEXT)).rejects.toThrow("allowance");
    expect(h.resolveAiModel).not.toHaveBeenCalled();
  });
});

describe("sendChatMessage — persistence and history", () => {
  it("persists only the new user turn, never the whole transcript", async () => {
    await sendChatMessage(
      [
        { role: "user", content: "old" },
        { role: "assistant", content: "older reply" },
        { role: "user", content: "new" },
      ],
      NO_CONTEXT,
    );

    const userWrites = h.appendChatMessage.mock.calls.filter((c) => (c[1] as { role: string }).role === "user");
    expect(userWrites).toHaveLength(1);
    expect(userWrites[0]![1]).toMatchObject({ content: "new" });
  });

  it("persists the assistant's reply with its follow-up", async () => {
    await sendChatMessage([{ role: "user", content: "hi" }], NO_CONTEXT);

    expect(h.appendChatMessage).toHaveBeenLastCalledWith("w-account", {
      role: "assistant",
      content: REPLY.answer,
      followUp: REPLY.followUp,
    });
  });

  it("does not persist a trailing assistant turn as if it were new input", async () => {
    await sendChatMessage(
      [
        { role: "user", content: "hi" },
        { role: "assistant", content: "already replied" },
      ],
      NO_CONTEXT,
    );

    const userWrites = h.appendChatMessage.mock.calls.filter((c) => (c[1] as { role: string }).role === "user");
    expect(userWrites).toEqual([]);
  });

  it("caps how much history rides along on the request", async () => {
    const long = Array.from({ length: 30 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `turn ${i}`,
    }));

    await sendChatMessage(long, NO_CONTEXT);

    const sent = h.generateObject.mock.calls[0]![0].messages as unknown[];
    expect(sent).toHaveLength(20);
    expect((sent.at(-1) as { content: string }).content).toBe("turn 29");
  });

  it("returns the assistant's answer and follow-up", async () => {
    await expect(sendChatMessage([{ role: "user", content: "hi" }], NO_CONTEXT)).resolves.toEqual(REPLY);
  });

  it("grounds the request in the page context via the system prompt", async () => {
    await sendChatMessage([{ role: "user", content: "hi" }], { businessId: "biz-1", productId: null });

    expect(String(h.generateObject.mock.calls[0]![0].system)).toContain("Acme Co");
  });

  it("normalizes a provider failure and records it", async () => {
    h.generateObject.mockRejectedValue(new Error("boom"));

    await expect(sendChatMessage([{ role: "user", content: "hi" }], NO_CONTEXT)).rejects.toThrow("normalized");
    expect(h.recordAiRun).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });
});

/**
 * Starters are the panel's only content before a founder types anything, so they double
 * as the product's "what should I do next" hint. They follow the pipeline order — profile,
 * then ICP, then prospects, then the ones needing action — and only the *first* unmet step
 * is offered, so an empty product never suggests outreach work it cannot do yet.
 */
describe("getChatPanelData — starter questions on a product", () => {
  const PRODUCT_CONTEXT = { businessId: "biz-1", productId: "prod-1" };
  const starters = async () => (await getChatPanelData(PRODUCT_CONTEXT))!.starterQuestions;

  it("asks for a product profile first", async () => {
    h.getProduct.mockResolvedValue({ id: "prod-1", name: "Widgets", business_id: "biz-1", product_profile: null });

    expect(await starters()).toContain("How do I generate a product profile for Widgets?");
  });

  it("asks for an ICP once the profile exists", async () => {
    h.getIcpProfile.mockResolvedValue(null);

    const questions = await starters();
    expect(questions).toContain("How do I define an ICP for Widgets?");
    expect(questions).not.toContain("How do I generate a product profile for Widgets?");
  });

  it("asks for first prospects once the ICP exists", async () => {
    expect(await starters()).toContain("How do I find my first prospects for Widgets?");
  });

  it("points at the prospects that need action, pluralised", async () => {
    h.listProspects.mockResolvedValue([
      { id: "p1", nextAction: "Research this prospect" },
      { id: "p2", nextAction: "Score this prospect" },
    ]);

    expect(await starters()).toContain(
      "What should I do next with the 2 prospects that need action?",
    );
  });

  it("uses the singular for a single prospect needing action", async () => {
    h.listProspects.mockResolvedValue([{ id: "p1", nextAction: "Research this prospect" }]);

    expect(await starters()).toContain(
      "What should I do next with the 1 prospect that need action?",
    );
  });

  it("falls back to the generic prompts when nothing is outstanding", async () => {
    h.listProspects.mockResolvedValue([{ id: "p1", nextAction: null }]);

    const questions = await starters();
    expect(questions).toContain("How can I improve my outreach messaging?");
    expect(questions.some((q: string) => q.startsWith("How do I"))).toBe(false);
  });
});

describe("getChatPanelData — context on a business page", () => {
  const BUSINESS_CONTEXT = { businessId: "biz-1", productId: null };

  it("offers to create a first product when the business has none", async () => {
    h.listProducts.mockResolvedValue([]);

    const data = await getChatPanelData(BUSINESS_CONTEXT);

    expect(data!.starterQuestions).toEqual([
      "How do I create my first product for Acme Co?",
      "How does CoFounderAI work?",
    ]);
  });

  it("asks which product needs attention once there are some", async () => {
    const data = await getChatPanelData(BUSINESS_CONTEXT);

    expect(data!.starterQuestions).toEqual([
      "Which of my products needs attention next?",
      "How can I improve my outreach messaging?",
    ]);
  });

  it("falls through to the account context when the business is out of reach", async () => {
    h.getBusiness.mockResolvedValue(null);

    const data = await getChatPanelData(BUSINESS_CONTEXT);

    expect(h.getFirstWorkspaceForBusiness).not.toHaveBeenCalled();
    expect(data!.starterQuestions.length).toBeGreaterThan(0);
  });

  it("falls through to the account context when the product is out of reach", async () => {
    h.getProduct.mockResolvedValue(null);

    const data = await getChatPanelData({ businessId: "biz-1", productId: "prod-1" });

    // resolved as the business page instead, not as the missing product
    expect(data!.starterQuestions).toContain("Which of my products needs attention next?");
  });

  it("falls through when the product exists but its workspace does not", async () => {
    h.getWorkspaceForProduct.mockResolvedValue(null);

    const data = await getChatPanelData({ businessId: "biz-1", productId: "prod-1" });

    expect(data!.starterQuestions).toContain("Which of my products needs attention next?");
  });
});

describe("sendChatMessage — account summary", () => {
  it("counts a single business, product and prospect in the singular", async () => {
    h.listBusinesses.mockResolvedValue([{ id: "biz-1", name: "Acme Co" }]);
    h.listProducts.mockResolvedValue([{ id: "prod-1", name: "Widgets" }]);
    h.getProspectCountsForWorkspaces.mockResolvedValue({ w1: { total: 1, new: 1, qualified: 0, disqualified: 0 } });

    await sendChatMessage([{ role: "user", content: "hi" }], NO_CONTEXT);

    expect(String(h.generateObject.mock.calls[0]![0].system)).toContain(
      "Account overview: 1 business, 1 product total, 1 prospect across the account.",
    );
  });

  it("pluralises them once there is more than one of each", async () => {
    h.listBusinesses.mockResolvedValue([
      { id: "biz-1", name: "Acme Co" },
      { id: "biz-2", name: "Initech" },
    ]);
    h.listProducts.mockResolvedValue([
      { id: "prod-1", name: "Widgets" },
      { id: "prod-2", name: "Gadgets" },
    ]);

    await sendChatMessage([{ role: "user", content: "hi" }], NO_CONTEXT);

    expect(String(h.generateObject.mock.calls[0]![0].system)).toContain(
      "5 prospects across the account.",
    );
  });

  it("says so for a business with no products yet", async () => {
    h.listProducts.mockResolvedValue([]);

    await sendChatMessage([{ role: "user", content: "hi" }], NO_CONTEXT);

    expect(String(h.generateObject.mock.calls[0]![0].system)).toContain('"Acme Co": products: none yet');
  });

  it("drops a follow-up the model returned as an empty string", async () => {
    h.generateObject.mockResolvedValue({
      object: { answer: "Done", followUp: "" },
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    await expect(sendChatMessage([{ role: "user", content: "hi" }], NO_CONTEXT)).resolves.toEqual({
      answer: "Done",
      followUp: null,
    });
  });
});
