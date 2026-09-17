/**
 * Message generation sits behind blueprint §20's human-approval gate: it only works from
 * an *approved* strategy, and every message it creates is a draft. Generation never sends
 * anything — that boundary is the point of both guards.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, writtenRow } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({
  createClient: vi.fn(),
  getOutreachStrategy: vi.fn(),
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
vi.mock("../outreach/queries", () => ({ getOutreachStrategy: h.getOutreachStrategy }));
vi.mock("../prospects/queries", () => ({ getProspect: h.getProspect }));
vi.mock("../tenancy/queries", () => ({ getWorkspace: h.getWorkspace, getProduct: h.getProduct }));
vi.mock("./usage", () => ({ recordAiRun: h.recordAiRun }));
vi.mock("../usage/limits", () => ({ assertWithinUsageLimit: h.assertWithinUsageLimit }));
vi.mock("./router", () => ({ resolveAiModel: h.resolveAiModel, toAiProviderError: h.toAiProviderError }));

const { generateOutreachMessage } = await import("./generate-message");

const STRATEGY = {
  id: "s1",
  prospect_id: "p1",
  contact_id: null,
  status: "approved",
  channel: "email",
  angle: "stockouts",
  talking_points: ["a"],
  cta: "book a call",
};
const DRAFT = { subject: "Quick note", content: "Hello there" };

function mockDb(contact: unknown = null, error: unknown = null) {
  const supabase = createFakeSupabase({
    query: (call) =>
      call.table === "contacts" ? { data: contact, error: null } : { data: { id: "m1", ...DRAFT }, error },
  });
  h.createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getOutreachStrategy.mockResolvedValue(STRATEGY);
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
  h.generateObject.mockResolvedValue({ object: DRAFT, usage: { inputTokens: 40, outputTokens: 20 } });
  h.toAiProviderError.mockImplementation(() => Object.assign(new Error("normalized"), { code: "unknown" }));
});

describe("generateOutreachMessage — guards", () => {
  it("refuses a strategy that is not visible", async () => {
    mockDb();
    h.getOutreachStrategy.mockResolvedValue(null);

    await expect(generateOutreachMessage("s1")).rejects.toThrow("Strategy not found.");
  });

  it("refuses an unapproved strategy — the human gate comes first", async () => {
    mockDb();
    h.getOutreachStrategy.mockResolvedValue({ ...STRATEGY, status: "draft" });

    await expect(generateOutreachMessage("s1")).rejects.toThrow(
      "Approve the strategy before generating a message.",
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

    await expect(generateOutreachMessage("s1")).rejects.toThrow(message);
    expect(h.generateObject).not.toHaveBeenCalled();
  });

  it("checks the spend cap before resolving a model", async () => {
    mockDb();
    h.assertWithinUsageLimit.mockRejectedValue(new Error("allowance"));

    await expect(generateOutreachMessage("s1")).rejects.toThrow("allowance");
    expect(h.resolveAiModel).not.toHaveBeenCalled();
  });
});

describe("generateOutreachMessage — outcome", () => {
  it("creates the message as a draft, never sent", async () => {
    const supabase = mockDb();

    await generateOutreachMessage("s1");

    expect(writtenRow(supabase.queries("messages")[0]!)).toMatchObject({ status: "draft" });
  });

  it("attaches the message to the strategy's prospect and channel", async () => {
    const supabase = mockDb();

    await generateOutreachMessage("s1");

    expect(writtenRow(supabase.queries("messages")[0]!)).toMatchObject({
      workspace_id: "w1",
      prospect_id: "p1",
      channel: "email",
    });
  });

  it("loads the strategy's chosen contact, when it has one", async () => {
    const supabase = mockDb({ id: "c1", first_name: "Ada" });
    h.getOutreachStrategy.mockResolvedValue({ ...STRATEGY, contact_id: "c1" });

    await generateOutreachMessage("s1");

    expect(eqFilters(supabase.queries("contacts")[0]!)).toEqual({ id: "c1" });
  });

  it("does not query contacts when the strategy targets none", async () => {
    const supabase = mockDb();

    await generateOutreachMessage("s1");

    expect(supabase.queries("contacts")).toEqual([]);
  });

  it("records a succeeded ledger row", async () => {
    mockDb();

    await generateOutreachMessage("s1");

    expect(h.recordAiRun).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "generate_outreach_message", status: "succeeded" }),
    );
  });

  it("normalizes a provider failure, records it, and writes no message", async () => {
    const supabase = mockDb();
    h.generateObject.mockRejectedValue(new Error("boom"));

    await expect(generateOutreachMessage("s1")).rejects.toThrow("normalized");
    expect(h.recordAiRun).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
    expect(supabase.queries("messages")).toEqual([]);
  });

  it("propagates a failure to persist the drafted message", async () => {
    mockDb(null, new Error("insert denied"));

    await expect(generateOutreachMessage("s1")).rejects.toThrow();
  });
});
