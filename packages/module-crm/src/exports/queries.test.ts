import { beforeEach, describe, expect, it, vi } from "vitest";

// EXP-CRM-01..10 -- the export-only reads: same predicates as the pages, tenant always
// applied, paged past PostgREST's 1,000-row cap, lookups in bounded batches, and no
// provider metadata selected for messages.

type Row = Record<string, unknown>;
type Call = { table: string; method: string; args: unknown[] };

const state = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, calls: [] as Call[] }));

function fakeClient() {
  return {
    from(table: string) {
      let rows = [...(state.tables[table] ?? [])];
      const record = (method: string, args: unknown[]) => state.calls.push({ table, method, args });
      const builder = {
        select: (...args: unknown[]) => (record("select", args), builder),
        eq: (column: string, value: unknown) => {
          record("eq", [column, value]);
          rows = rows.filter((r) => r[column] === value);
          return builder;
        },
        in: (column: string, values: unknown[]) => {
          record("in", [column, values]);
          rows = rows.filter((r) => values.includes(r[column]));
          return builder;
        },
        is: (...args: unknown[]) => (record("is", args), builder),
        order: (...args: unknown[]) => (record("order", args), builder),
        range: async (from: number, to: number) => (record("range", [from, to]), { data: rows.slice(from, to + 1), error: null }),
        maybeSingle: async () => (record("maybeSingle", []), { data: rows[0] ?? null, error: null }),
        then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
      };
      return builder;
    },
  };
}

vi.mock("../db/server", () => ({ createClient: async () => fakeClient() }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: async () => fakeClient() }));
vi.mock("../lib/follow-ups/queries", () => ({
  enrichFollowUpQueue: vi.fn(async (_businessId: string, rows: Row[]) => rows.map((r) => ({ ...r, partyName: "x" }))),
}));
vi.mock("../lib/interactions/queries", () => ({
  buildPotentialLostBusinessQueue: vi.fn(async (rows: Row[]) => rows.map((r) => ({ interactionId: r.id }))),
}));

import { enrichFollowUpQueue } from "../lib/follow-ups/queries";
import {
  getConversationMessagesForExport,
  listConversationQueueForExport,
  listFollowUpQueueForExport,
  listLeadsForExport,
  listPartiesForExport,
  listPotentialLostBusinessQueueForExport,
} from "./queries";

const BIZ = "biz-1";

beforeEach(() => {
  state.tables = {};
  state.calls = [];
  vi.clearAllMocks();
});

function callsFor(table: string, method: string) {
  return state.calls.filter((c) => c.table === table && c.method === method).map((c) => c.args);
}

describe("CRM export queries (EXP-CRM-01..10)", () => {
  it("listLeadsForExport pages past 1,000 rows with a stable order, scoped to the business (EXP-CRM-02)", async () => {
    state.tables.lead = [
      ...Array.from({ length: 1500 }, (_, i) => ({ id: `l${i}`, business_id: BIZ })),
      { id: "foreign", business_id: "biz-other" },
    ];
    const rows = await listLeadsForExport(BIZ);
    expect(rows).toHaveLength(1500);
    expect(rows.some((r) => r.id === "foreign")).toBe(false);
    expect(callsFor("lead", "eq")[0]).toEqual(["business_id", BIZ]);
    expect(callsFor("lead", "range")).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(callsFor("lead", "order").at(-1)).toEqual(["id", { ascending: true }]);
  });

  it("listPartiesForExport looks parties up in bounded batches within the business", async () => {
    state.tables.parties = Array.from({ length: 450 }, (_, i) => ({ id: `p${i}`, business_id: BIZ, name: `P${i}` }));
    const byId = await listPartiesForExport(BIZ, [...state.tables.parties.map((p) => p.id as string), "p1", ""]);
    expect(byId.size).toBe(450);
    const inCalls = callsFor("parties", "in");
    expect(inCalls).toHaveLength(3);
    expect(inCalls.every(([, ids]) => (ids as string[]).length <= 200)).toBe(true);
    expect(callsFor("parties", "eq").every(([column, value]) => column === "business_id" && value === BIZ)).toBe(true);
  });

  it("listFollowUpQueueForExport keeps the page's pending predicate and enriches in batches (EXP-CRM-07)", async () => {
    state.tables.follow_up = [
      ...Array.from({ length: 250 }, (_, i) => ({ id: `f${i}`, business_id: BIZ, status: "pending" })),
      { id: "done", business_id: BIZ, status: "completed" },
    ];
    const rows = await listFollowUpQueueForExport(BIZ);
    expect(rows).toHaveLength(250);
    expect(callsFor("follow_up", "eq")).toEqual([
      ["business_id", BIZ],
      ["status", "pending"],
    ]);
    expect(vi.mocked(enrichFollowUpQueue)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(enrichFollowUpQueue).mock.calls.every(([businessId]) => businessId === BIZ)).toBe(true);
  });

  it("listPotentialLostBusinessQueueForExport drops the page's 200 cap but keeps its predicates (EXP-CRM-05)", async () => {
    state.tables.interaction = Array.from({ length: 1200 }, (_, i) => ({ id: `i${i}`, business_id: BIZ, requires_response: true }));
    const rows = await listPotentialLostBusinessQueueForExport(BIZ);
    expect(rows).toHaveLength(1200);
    expect(callsFor("interaction", "eq")).toContainEqual(["requires_response", true]);
    expect(callsFor("interaction", "is")).toContainEqual(["responded_at", null]);
  });

  it("listConversationQueueForExport computes flags from every interaction of each conversation (EXP-CRM-09)", async () => {
    state.tables.conversation = [{ id: "c1", business_id: BIZ, party_id: "p1", assigned_to: null }];
    state.tables.interaction = [
      { id: "i1", business_id: BIZ, conversation_id: "c1", requires_response: true, responded_at: null, response_due_at: "2000-01-01T00:00:00Z", intent_confidence: 0.9 },
    ];
    state.tables.parties = [{ id: "p1", business_id: BIZ, name: "Asha" }];
    const [row] = await listConversationQueueForExport(BIZ, new Date("2026-09-26T00:00:00Z"));
    expect(row).toMatchObject({ id: "c1", partyName: "Asha", needsResponse: true, overdue: true, highIntent: true });
  });

  it("getConversationMessagesForExport refuses another business's conversation and never selects metadata or media (EXP-CRM-09)", async () => {
    state.tables.conversation = [{ id: "c1", business_id: "biz-other" }];
    expect(await getConversationMessagesForExport(BIZ, "c1")).toBeNull();

    state.tables.conversation = [{ id: "c1", business_id: BIZ }];
    state.tables.interaction = [{ id: "m1", business_id: BIZ, conversation_id: "c1" }];
    const result = await getConversationMessagesForExport(BIZ, "c1");
    expect(result?.messages).toHaveLength(1);
    const [columns] = callsFor("interaction", "select").at(-1) as [string];
    expect(columns).not.toMatch(/\*|media_reference|content_reference|external_|metadata,|metadata$/);
    expect(columns).toContain("provider_status:metadata->>providerStatus");
  });
});
