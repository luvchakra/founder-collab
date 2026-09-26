// EXP-FND-05/08/09 -- the export-only Funding reads: the loaders' predicates, paged past
// the screen's bounds, and never a storage location or a provider identifier.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, type FakeSupabase, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({ createClient: vi.fn(), createCoreClient: vi.fn() }));
vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: h.createCoreClient }));

import { listDataRoomItemsForExport, listInvestorsForExport, listOutreachForExport, primaryContactsForExport } from "./queries";
import { BUSINESS_ID } from "./test-support";

let discovery: FakeSupabase;
let core: FakeSupabase;
const ops = (q: RecordedQuery, method: string) => q.ops.filter((o) => o.method === method).map((o) => o.args);

beforeEach(() => {
  vi.clearAllMocks();
  discovery = createFakeSupabase();
  core = createFakeSupabase();
  h.createClient.mockImplementation(async () => discovery);
  h.createCoreClient.mockImplementation(async () => core);
});

describe("EXP-FND-05 listInvestorsForExport", () => {
  it("pages past the 1,000-row bound, filters by business and status, sorts by name", async () => {
    discovery = createFakeSupabase({
      query: (q) => {
        const [from, to] = ops(q, "range")[0] as [number, number];
        const rows = [];
        for (let i = from; i <= Math.min(to, 1049); i += 1) rows.push({ id: `i-${i}`, party_id: `p-${i}`, investor_type: "vc", source: "inbound", status: "active" });
        return { data: rows, error: null };
      },
    });
    core = createFakeSupabase({
      query: (q) => ({ data: (ops(q, "in")[0]![1] as string[]).map((id) => ({ id, name: `Firm ${id}`, email: null })), error: null }),
    });
    const rows = await listInvestorsForExport(BUSINESS_ID, "archived");
    expect(rows).toHaveLength(1050);
    const first = discovery.queries("investors")[0]!;
    expect(eqFilters(first)).toEqual({ business_id: BUSINESS_ID, status: "archived" });
    expect(ops(first, "order")).toEqual([["created_at", { ascending: false }], ["id", { ascending: true }]]);
    for (const q of core.queries("parties")) expect(eqFilters(q)).toEqual({ business_id: BUSINESS_ID });
    expect(rows.map((r) => r.name)).toEqual([...rows.map((r) => r.name)].sort((a, b) => a.localeCompare(b)));
  });

  it("reads every status for 'all'", async () => {
    await listInvestorsForExport(BUSINESS_ID, "all");
    expect(eqFilters(discovery.queries("investors")[0]!)).toEqual({ business_id: BUSINESS_ID });
  });
});

describe("EXP-FND-05 primaryContactsForExport", () => {
  it("reads active primary contacts of this business's parties", async () => {
    core = createFakeSupabase({ query: () => ({ data: [{ party_id: "p-1", first_name: "Priya", last_name: "Rao", email: "p@x.example", job_title: null }], error: null }) });
    const contacts = await primaryContactsForExport(BUSINESS_ID, ["p-1", "p-1"]);
    expect(contacts.get("p-1")).toEqual({ name: "Priya Rao", email: "p@x.example", jobTitle: null });
    const q = core.queries("party_contacts")[0]!;
    expect(eqFilters(q)).toEqual({ business_id: BUSINESS_ID, status: "active", is_primary: true });
    expect(ops(q, "in")).toEqual([["party_id", ["p-1"]]]);
  });
});

describe("EXP-FND-08 listOutreachForExport", () => {
  it("keeps the status filter, adds the creation time, drops the provider's message id", async () => {
    discovery = createFakeSupabase({
      query: (q) =>
        q.table === "investor_outreach"
          ? { data: [{ id: "o-1", investor_id: "i-1", subject: "Hi", body: "b", status: "sent", origin: "user", provider_message_id: "prov-1", created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-02T00:00:00Z" }], error: null }
          : { data: [{ id: "i-1", party_id: "p-1" }], error: null },
    });
    core = createFakeSupabase({ query: () => ({ data: [{ id: "p-1", name: "Blue Fund" }], error: null }) });
    const rows = await listOutreachForExport(BUSINESS_ID, { status: "sent" });
    expect(eqFilters(discovery.queries("investor_outreach")[0]!)).toEqual({ business_id: BUSINESS_ID, status: "sent" });
    expect(rows[0]).toMatchObject({ investorName: "Blue Fund", createdAt: "2026-09-01T00:00:00Z", providerMessageId: null });
  });
});

describe("EXP-FND-09 listDataRoomItemsForExport", () => {
  it("reads every version of this business's items and never selects a storage location", async () => {
    discovery = createFakeSupabase({
      query: () => ({ data: [{ id: "d-1", name: "Deck", category: "fundraising", attachment_id: "a-1", status: "ready", version: 2, is_current: true, sensitivity: "standard" }], error: null }),
    });
    core = createFakeSupabase({ query: () => ({ data: [{ id: "a-1", file_name: "deck.pdf", content_type: "application/pdf", size_bytes: 10, created_at: "2026-09-01T00:00:00Z" }], error: null }) });
    const rows = await listDataRoomItemsForExport(BUSINESS_ID);
    const items = discovery.queries("data_room_items")[0]!;
    expect(eqFilters(items)).toEqual({ business_id: BUSINESS_ID });
    expect(String(ops(items, "select")[0]![0])).not.toMatch(/storage/);
    const files = core.queries("attachments")[0]!;
    expect(eqFilters(files)).toEqual({ business_id: BUSINESS_ID });
    expect(String(ops(files, "select")[0]![0])).not.toMatch(/storage/);
    expect(rows[0]).toMatchObject({ fileName: "deck.pdf", uploadedAt: "2026-09-01T00:00:00Z", version: 2 });
    expect(Object.keys(rows[0]!).join(",")).not.toMatch(/storage|path|url/i);
  });
});
