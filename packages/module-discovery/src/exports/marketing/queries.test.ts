// EXP-MKT-01..07 -- the export-only Marketing reads: the same predicates as the page
// loaders they shadow, paged past the screen's bounds, and never a storage location.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, type FakeSupabase, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";

const h = vi.hoisted(() => ({ createClient: vi.fn(), createCoreClient: vi.fn() }));
vi.mock("../../db/server", () => ({ createClient: h.createClient }));
vi.mock("@cofounderai/core/db/server", () => ({ createClient: h.createCoreClient }));

import {
  listAssetsForExport,
  listCampaignMetricsForExport,
  listCampaignsForExport,
  listContentForExport,
  listNamesForExport,
  listSeoItemsForExport,
} from "./queries";
import { BUSINESS_ID } from "./test-support";

let discovery: FakeSupabase;
let core: FakeSupabase;

const ops = (q: RecordedQuery, method: string) => q.ops.filter((o) => o.method === method).map((o) => o.args);

/** A table that answers every `.range(from, to)` with the slice of `total` rows it asks for. */
function paged(total: number, make: (i: number) => Record<string, unknown>) {
  return (q: RecordedQuery) => {
    const range = ops(q, "range")[0] as [number, number] | undefined;
    const [from, to] = range ?? [0, total - 1];
    const rows = [];
    for (let i = from; i <= Math.min(to, total - 1); i += 1) rows.push(make(i));
    return { data: rows, error: null };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  discovery = createFakeSupabase();
  core = createFakeSupabase();
  h.createClient.mockImplementation(async () => discovery);
  h.createCoreClient.mockImplementation(async () => core);
});

describe("EXP-MKT-03 listCampaignsForExport", () => {
  it("pages past the page's 500-row bound with the loader's predicates and a stable order", async () => {
    discovery = createFakeSupabase({ query: paged(1203, (i) => ({ id: `c-${i}`, business_id: BUSINESS_ID, name: `C${i}`, status: "active", utm: null })) });
    const rows = await listCampaignsForExport(BUSINESS_ID, { status: "all", channel: "email", offeringId: "o-1", sort: "name" });
    expect(rows).toHaveLength(1203);
    const calls = discovery.queries("marketing_campaigns");
    expect(calls).toHaveLength(2);
    const first = calls[0]!;
    expect(eqFilters(first)).toMatchObject({ business_id: BUSINESS_ID, channel: "email", offering_id: "o-1" });
    expect(ops(first, "neq")).toEqual([["status", "archived"]]);
    expect(ops(first, "order")).toEqual([["name", { ascending: true }], ["id", { ascending: true }]]);
    expect(ops(first, "limit")).toEqual([]);
    expect(rows[0]).toMatchObject({ id: "c-0", budget: null, utm: {} });
  });

  it("filters by an explicit status instead of excluding archived", async () => {
    await listCampaignsForExport(BUSINESS_ID, { status: "archived" });
    const q = discovery.queries("marketing_campaigns")[0]!;
    expect(eqFilters(q)).toMatchObject({ status: "archived" });
    expect(ops(q, "neq")).toEqual([]);
    expect(ops(q, "order")[0]).toEqual(["created_at", { ascending: false }]);
  });
});

describe("EXP-MKT-01/03/07 listCampaignMetricsForExport", () => {
  it("keeps the window and business filter, slices long id lists, and keeps nulls null", async () => {
    discovery = createFakeSupabase({
      query: () => ({ data: [{ campaign_id: "c-1", metric_date: "2026-09-01", source: "manual", leads: null, spend: "10.5" }], error: null }),
    });
    const ids = Array.from({ length: 160 }, (_, i) => `c-${i}`);
    const rows = await listCampaignMetricsForExport(BUSINESS_ID, { from: "2026-09-01", to: "2026-09-30" }, ids);
    const calls = discovery.queries("marketing_campaign_metrics");
    expect(calls).toHaveLength(2); // 150 + 10 ids
    expect(eqFilters(calls[0]!)).toMatchObject({ business_id: BUSINESS_ID });
    expect(ops(calls[0]!, "gte")).toEqual([["metric_date", "2026-09-01"]]);
    expect(ops(calls[0]!, "lte")).toEqual([["metric_date", "2026-09-30"]]);
    expect((ops(calls[0]!, "in")[0]![1] as string[]).length).toBe(150);
    expect(rows[0]).toMatchObject({ leads: null, spend: 10.5 });
  });

  it("asks for nothing when there are no campaigns", async () => {
    expect(await listCampaignMetricsForExport(BUSINESS_ID, { from: "a", to: "b" }, [])).toEqual([]);
    expect(discovery.calls).toHaveLength(0);
  });
});

describe("EXP-MKT-05 listContentForExport", () => {
  it("applies the list's filters for this business only", async () => {
    await listContentForExport(BUSINESS_ID, { status: "review", contentType: "blog", campaignId: "c-1" });
    const q = discovery.queries("marketing_content")[0]!;
    expect(eqFilters(q)).toEqual({ business_id: BUSINESS_ID, status: "review", content_type: "blog", campaign_id: "c-1" });
    expect(ops(q, "order")).toEqual([["updated_at", { ascending: false }], ["id", { ascending: true }]]);
  });
});

describe("EXP-MKT-06 listAssetsForExport", () => {
  it("reads active assets and file facts, never the storage bucket or path", async () => {
    discovery = createFakeSupabase({ query: () => ({ data: [{ id: "a-1", attachment_id: "att-1", name: "Logo", asset_type: "logo", status: "active" }], error: null }) });
    core = createFakeSupabase({ query: () => ({ data: [{ id: "att-1", file_name: "logo.svg", content_type: "image/svg+xml", size_bytes: 12 }], error: null }) });
    const rows = await listAssetsForExport(BUSINESS_ID);
    const assetQuery = discovery.queries("marketing_assets")[0]!;
    expect(eqFilters(assetQuery)).toEqual({ business_id: BUSINESS_ID, status: "active" });
    const attachmentQuery = core.queries("attachments")[0]!;
    expect(eqFilters(attachmentQuery)).toEqual({ business_id: BUSINESS_ID });
    expect(String(ops(attachmentQuery, "select")[0]![0])).not.toMatch(/storage/);
    expect(rows[0]).toMatchObject({ fileName: "logo.svg", sizeBytes: 12 });
    expect(rows[0]).not.toHaveProperty("storagePath");
    expect(rows[0]).not.toHaveProperty("storageBucket");
  });
});

describe("EXP-MKT-06 listSeoItemsForExport / listNamesForExport", () => {
  it("defaults to open and in-progress items, like the page", async () => {
    await listSeoItemsForExport(BUSINESS_ID);
    const q = discovery.queries("marketing_seo_items")[0]!;
    expect(eqFilters(q)).toEqual({ business_id: BUSINESS_ID });
    expect(ops(q, "in")).toEqual([["status", ["open", "in_progress"]]]);
  });

  it("names every campaign of the business, archived included", async () => {
    discovery = createFakeSupabase({ query: () => ({ data: [{ id: "c-1", name: "Old" }], error: null }) });
    const names = await listNamesForExport(BUSINESS_ID, "marketing_campaigns");
    expect(names.get("c-1")).toBe("Old");
    const q = discovery.queries("marketing_campaigns")[0]!;
    expect(eqFilters(q)).toEqual({ business_id: BUSINESS_ID });
    expect(ops(q, "neq")).toEqual([]);
  });
});
