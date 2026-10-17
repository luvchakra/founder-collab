import { beforeEach, describe, expect, it, vi } from "vitest";

// PLATFORM-P1-12.7: the MCP reply draft runs with no session, so it must pin every read to the
// API key's business, check the CRM licence and the key's permission itself, and use only the
// sender's own orders and jobs.

const state = vi.hoisted(() => ({
  licensed: true as boolean,
  interaction: { id: "i-1", party_id: "p-1", channel: "whatsapp", content_excerpt: "Where is my order?" } as Record<string, unknown> | null,
  eqs: [] as [string, string, unknown][],
}));

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const self = () => b;
  b.select = self;
  b.order = self;
  b.limit = self;
  b.eq = (col: string, val: unknown) => {
    state.eqs.push([table, col, val]);
    return b;
  };
  b.maybeSingle = async () => ({ data: table === "interaction" ? state.interaction : { currency: "INR" }, error: null });
  b.single = async () => ({ data: { name: "Wax Garden", description: null, website: null, contact_phone: null, contact_email: null, address: null, opening_hours: null }, error: null });
  b.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  return b;
}

vi.mock("@cofounderai/core/db/admin", () => ({
  createAdminClient: () => ({ from: builder, rpc: async () => ({ data: state.licensed, error: null }) }),
}));
const knowledge = vi.hoisted(() => ({ result: { ok: true, data: [{ id: "k1", offeringName: "Candles", sourceName: "FAQ", content: "Soy wax." }] } as unknown }));
const listKnowledge = vi.fn(async (_businessId: string) => knowledge.result);
vi.mock("@cofounderai/module-discovery/contract/index", () => ({ listOfferingKnowledgeForBusinessService: (id: string) => listKnowledge(id) }));
const runReplyDraft = vi.fn(async (input: { facts: { id: string }[]; businessId: string }) => ({ status: "answered", answer: "x", topic: "order_job_status", factsUsed: [], createdAt: "t", _facts: input.facts.map((f) => f.id), _biz: input.businessId }));
vi.mock("./reply-draft", () => ({ runReplyDraft: (input: never) => runReplyDraft(input) }));

import { generateReplyDraftForApiKey, ReplyDraftRefused } from "./reply-draft-api";

const readList = vi.fn(async (resource: "sales-orders" | "jobs") =>
  resource === "sales-orders"
    ? [
        { id: "o-mine", so_number: "SO-1", status: "shipped", customer_id: "p-1", order_date: "2026-10-01" },
        { id: "o-other", so_number: "SO-2", status: "draft", customer_id: "p-2", order_date: "2026-10-02" },
      ]
    : [{ id: "j-other", number: "J-9", status: "scheduled", party_id: "p-9" }],
);

const call = (permissions = ["crm.view"]) => generateReplyDraftForApiKey({ businessId: "biz-1", permissions, conversationId: "c-1", readList });

beforeEach(() => {
  state.licensed = true;
  state.interaction = { id: "i-1", party_id: "p-1", channel: "whatsapp", content_excerpt: "Where is my order?" };
  state.eqs = [];
  runReplyDraft.mockClear();
});

describe("generateReplyDraftForApiKey", () => {
  it("refuses without a CRM licence", async () => {
    state.licensed = false;
    await expect(call()).rejects.toBeInstanceOf(ReplyDraftRefused);
    expect(runReplyDraft).not.toHaveBeenCalled();
  });

  it("refuses a key without crm.view", async () => {
    await expect(call(["inventory.view"])).rejects.toThrow("crm.view");
    expect(runReplyDraft).not.toHaveBeenCalled();
  });

  it("pins every read to the key's business", async () => {
    await call();
    for (const table of ["interaction", "businesses", "business_settings", "items"]) {
      const scoped = state.eqs.some(([t, col, val]) => t === table && (col === "business_id" || col === "id") && val === "biz-1");
      expect(scoped, `${table} is scoped to the key's business`).toBe(true);
    }
    expect(runReplyDraft.mock.calls[0]![0].businessId).toBe("biz-1");
  });

  it("uses only the sender's own orders and jobs", async () => {
    const draft = (await call()) as unknown as { _facts: string[] };
    expect(draft._facts).toContain("order.o-mine");
    expect(draft._facts).not.toContain("order.o-other");
    expect(draft._facts).not.toContain("job.j-other");
  });

    it("uses the business's own offering knowledge, read for the key's business", async () => {
    const draft = (await call()) as unknown as { _facts: string[] };
    expect(listKnowledge).toHaveBeenCalledWith("biz-1");
    expect(draft._facts).toContain("knowledge.k1");
  });

  it("drafts without knowledge when Discovery isn't licensed", async () => {
    knowledge.result = { ok: false, error: "MODULE_NOT_LICENSED" };
    const draft = (await call()) as unknown as { _facts: string[] };
    expect(draft._facts.some((f) => f.startsWith("knowledge."))).toBe(false);
    knowledge.result = { ok: true, data: [] };
  });

  it("refuses a conversation with no customer message in this business, or not on WhatsApp", async () => {
    state.interaction = null;
    await expect(call()).rejects.toThrow("No customer message");
    state.interaction = { id: "i-1", party_id: "p-1", channel: "instagram", content_excerpt: "hi" };
    await expect(call()).rejects.toThrow("isn't on WhatsApp");
  });
});
