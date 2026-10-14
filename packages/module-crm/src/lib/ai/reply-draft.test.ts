import { beforeEach, describe, expect, it, vi } from "vitest";

// PLATFORM-P1-12.1 / 12.4: the server half of AI reply drafts -- licence and permission first,
// one AI call per unchanged message, a provider failure recorded and reported, never saved.

const state = vi.hoisted(() => ({
  interaction: { party_id: "party-1", direction: "inbound", content_excerpt: "What are your hours?" } as Record<string, unknown>,
  existing: null as Record<string, unknown> | null,
  upserts: [] as Record<string, unknown>[],
}));

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const self = () => b;
  b.select = self;
  b.eq = self;
  b.single = async () => (table === "interaction" ? { data: state.interaction, error: null } : { data: state.upserts.at(-1), error: null });
  b.maybeSingle = async () => (table === "business_settings" ? { data: { currency: "INR" }, error: null } : { data: state.existing, error: null });
  b.upsert = (row: Record<string, unknown>) => {
    state.upserts.push({ ...row, created_at: "2026-10-14T00:00:00Z" });
    return b;
  };
  return b;
}

vi.mock("../../db/server", () => ({
  createClient: async () => ({ from: builder, auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) } }),
}));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: async () => ({ from: builder }) }));
vi.mock("@cofounderai/core/licensing/queries", () => ({ requireModule: vi.fn(async () => undefined) }));
vi.mock("@cofounderai/core/rbac/require-permission", () => ({ requirePermission: vi.fn(async () => undefined) }));
vi.mock("@cofounderai/core/items/queries", () => ({ listItemsForBusiness: async () => [] }));
vi.mock("@cofounderai/module-inventory/contract/index", () => ({ listRecentOrdersForParty: async () => ({ ok: false, error: "MODULE_NOT_LICENSED" }) }));
vi.mock("@cofounderai/module-fsm/contract/index", () => ({ listRecentJobsForParty: async () => ({ ok: true, data: [] }) }));
vi.mock("@cofounderai/module-discovery/contract/index", () => ({ listOfferingKnowledgeForBusiness: async () => ({ ok: true, data: [] }) }));
vi.mock("../tenancy/queries", () => ({
  getBusiness: async () => ({ name: "Wax Garden", description: null, website: null, contact_phone: null, contact_email: null, address: null, opening_hours: "Mon-Sat 10-7" }),
}));
const recordAiRun = vi.fn(async () => undefined);
vi.mock("@cofounderai/core/ai-usage/mutations", () => ({ recordAiRun: (...args: unknown[]) => recordAiRun(...(args as [])) }));
vi.mock("@cofounderai/core/ai/business-router", () => ({
  resolveBusinessAiModel: vi.fn(async () => ({ businessId: "biz-1", provider: "openai", modelId: "m", model: {} })),
  toAiProviderError: (err: unknown) => Object.assign(new Error("The AI provider is unavailable."), { code: "provider_unavailable", cause: err }),
}));
const generateObject = vi.fn();
vi.mock("ai", () => ({ generateObject: (...args: unknown[]) => generateObject(...args) }));

import { generateReplyDraft } from "./reply-draft";
import { hashInput } from "@cofounderai/core/ai/hash";
import { buildReplyFacts, replyDraftPrompt, REPLY_DRAFT_PROMPT_VERSION } from "./reply-draft-core";
import { requireModule } from "@cofounderai/core/licensing/queries";

beforeEach(() => {
  state.existing = null;
  state.upserts = [];
  state.interaction = { party_id: "party-1", direction: "inbound", content_excerpt: "What are your hours?" };
  generateObject.mockReset();
  recordAiRun.mockClear();
});

describe("generateReplyDraft", () => {
  it("checks the CRM licence before anything else", async () => {
    vi.mocked(requireModule).mockRejectedValueOnce(new Error("MODULE_NOT_LICENSED"));
    await expect(generateReplyDraft("biz-1", "i-1")).rejects.toThrow("MODULE_NOT_LICENSED");
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("drafts from the business's facts, records the run and stores the draft", async () => {
    generateObject.mockResolvedValue({
      object: { can_answer: true, confidence: 0.9, topic: "hours_location_contact", answer: "We're open Mon-Sat 10-7.", fact_ids: ["business.hours"] },
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const draft = await generateReplyDraft("biz-1", "i-1");
    expect(draft).toMatchObject({ status: "answered", answer: "We're open Mon-Sat 10-7.", factsUsed: [{ id: "business.hours", label: "Opening hours" }] });
    expect(recordAiRun).toHaveBeenCalledWith(expect.objectContaining({ operation: "draft_customer_reply", status: "succeeded" }));
    expect(state.upserts[0]).toMatchObject({ business_id: "biz-1", interaction_id: "i-1", status: "answered" });
  });

  it("returns the stored draft without a second AI call when nothing changed", async () => {
    const facts = buildReplyFacts({
      business: { name: "Wax Garden", description: null, website: null, contact_phone: null, contact_email: null, address: null, opening_hours: "Mon-Sat 10-7" },
      currency: "INR",
      items: [],
      knowledge: [],
      orders: [],
      jobs: [],
    });
    const inputHash = hashInput({ prompt: replyDraftPrompt("Wax Garden", facts, "What are your hours?"), version: REPLY_DRAFT_PROMPT_VERSION });
    state.existing = { status: "answered", answer: "Cached.", topic: "hours_location_contact", facts_used: [], created_at: "x", input_hash: inputHash };
    expect(await generateReplyDraft("biz-1", "i-1")).toMatchObject({ answer: "Cached." });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("records a provider failure, reports it and stores nothing", async () => {
    generateObject.mockRejectedValue(new Error("503"));
    await expect(generateReplyDraft("biz-1", "i-1")).rejects.toThrow("The AI provider is unavailable.");
    expect(recordAiRun).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", errorCode: "provider_unavailable" }));
    expect(state.upserts).toHaveLength(0);
  });

  it("stores 'needs a person' when the model hands a sensitive question back", async () => {
    state.interaction = { party_id: "party-1", direction: "inbound", content_excerpt: "I want a refund" };
    generateObject.mockResolvedValue({
      object: { can_answer: false, confidence: 0.9, topic: "needs_person", answer: "", fact_ids: [] },
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    expect(await generateReplyDraft("biz-1", "i-1")).toMatchObject({ status: "not_answerable", topic: "needs_person" });
    expect(state.upserts[0]).toMatchObject({ status: "not_answerable", answer: null });
  });

  it("refuses to draft for an outgoing message", async () => {
    state.interaction = { party_id: "party-1", direction: "outbound", content_excerpt: "hi" };
    await expect(generateReplyDraft("biz-1", "i-1")).rejects.toThrow("no customer message");
  });
});
