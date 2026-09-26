// EXP-DISC-01/03/10/11/12 -- the export-only queries: same predicates as the page
// queries they copy, no 1,000-row cap, and (for prospects) row-for-row the same result.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Call = { table: string; op: string; args: unknown[] };

const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, calls: [] as Call[] }));

/** A PostgREST-ish builder over in-memory rows: records every call, applies eq/in/ilike,
 * and slices on range() -- enough to tell a capped query from a paged one. */
function builder(table: string) {
  let rows = [...(db.tables[table] ?? [])];
  let range: [number, number] | null = null;
  const record = (op: string, args: unknown[]) => db.calls.push({ table, op, args });
  const b = {
    select: (...args: unknown[]) => (record("select", args), b),
    eq: (col: string, value: unknown) => (record("eq", [col, value]), (rows = rows.filter((r) => r[col] === value)), b),
    in: (col: string, values: unknown[]) => (record("in", [col, values]), (rows = rows.filter((r) => values.includes(r[col]))), b),
    ilike: (col: string, pattern: string) => {
      record("ilike", [col, pattern]);
      const needle = pattern.replace(/%/g, "").toLowerCase();
      rows = rows.filter((r) => String(r[col]).toLowerCase().includes(needle));
      return b;
    },
    order: (...args: unknown[]) => (record("order", args), b),
    limit: (n: number) => (record("limit", [n]), (rows = rows.slice(0, n)), b),
    range: (from: number, to: number) => (record("range", [from, to]), (range = [from, to]), b),
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
      resolve({ data: range ? rows.slice(range[0], range[1] + 1) : rows.slice(0, 1000), error: null }),
  };
  return b;
}

vi.mock("../../db/server", () => ({ createClient: async () => ({ from: (table: string) => builder(table) }) }));

const { listProspects } = await import("../../lib/prospects/queries");
const {
  getPerformanceAnalysisRawDataForExport,
  getProspectCountsForExport,
  listPipelineRunsForExport,
  listProspectsForExport,
} = await import("./queries");

const WS = "ws-1";

function prospectRow(i: number, overrides: Row = {}): Row {
  const day = String((i % 28) + 1).padStart(2, "0");
  return {
    id: `p${String(i).padStart(5, "0")}`,
    workspace_id: WS,
    company_name: `Company ${i}`,
    website: null,
    domain: null,
    industry: i % 2 === 0 ? "Logistics" : "Retail",
    company_size: null,
    location: null,
    description: null,
    status: i % 3 === 0 ? "qualified" : "new",
    outcome: "open",
    fit_score: i % 5 === 0 ? null : i % 100,
    linkedin_url: null,
    twitter_url: null,
    company_email: null,
    party_id: null,
    created_at: `2026-08-${day}T00:00:${String(i % 60).padStart(2, "0")}Z`,
    updated_at: `2026-08-${day}T01:00:00Z`,
    prospect_research: i % 4 === 0 ? { researched_at: `2026-09-${day}T00:00:00Z` } : null,
    prospect_scores: i % 4 === 0 ? [{ created_at: `2026-09-${day}T02:00:00Z` }] : [],
    outreach_strategies: i % 8 === 0 ? [{ status: "approved", updated_at: `2026-09-${day}T03:00:00Z` }] : [],
    messages: i % 16 === 0 ? [{ status: "sent", created_at: `2026-09-${day}T04:00:00Z`, sent_at: `2026-09-${day}T05:00:00Z` }] : [],
    conversations: i % 32 === 0 ? [{ status: "replied", last_message_at: `2026-09-${day}T06:00:00Z` }] : [],
    ...overrides,
  };
}

beforeEach(() => {
  db.tables = {};
  db.calls = [];
});

describe("listProspectsForExport (EXP-DISC-03)", () => {
  it("returns exactly what listProspects returns for the same filters and sort", async () => {
    db.tables.prospects = Array.from({ length: 60 }, (_, i) => prospectRow(i));
    for (const sort of ["recent", "stage", "priority"] as const) {
      for (const filters of [{}, { status: "qualified" as const }, { industry: "Logistics", stage: "scored" as const }]) {
        const page = await listProspects(WS, filters, sort);
        const exported = await listProspectsForExport([WS], filters, sort);
        expect(exported.map(({ researchedAt: _r, ...rest }) => rest)).toEqual(page);
      }
    }
    // Both embed the same child tables for the pipeline stage.
    const selects = new Set(db.calls.filter((c) => c.op === "select").map((c) => String(c.args[0])));
    expect(selects.size).toBe(1);
  });

  it("uses the page's predicates: workspace, status, industry, search", async () => {
    db.tables.prospects = [prospectRow(1)];
    await listProspectsForExport([WS], { status: "new", industry: "Retail", search: "Comp" });
    const ops = db.calls.filter((c) => c.table === "prospects").map((c) => [c.op, ...c.args]);
    expect(ops).toContainEqual(["in", "workspace_id", [WS]]);
    expect(ops).toContainEqual(["eq", "status", "new"]);
    expect(ops).toContainEqual(["eq", "industry", "Retail"]);
    expect(ops).toContainEqual(["ilike", "company_name", "%Comp%"]);
    expect(ops).toContainEqual(["order", "id", { ascending: false }]);
  });

  it("pages past the 1,000-row cap that listProspects is subject to", async () => {
    db.tables.prospects = Array.from({ length: 2300 }, (_, i) => prospectRow(i));
    expect(await listProspects(WS)).toHaveLength(1000);
    const exported = await listProspectsForExport([WS]);
    expect(exported).toHaveLength(2300);
    expect(db.calls.filter((c) => c.op === "range").map((c) => c.args)).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("carries the research date the pipeline join already reads", async () => {
    db.tables.prospects = [prospectRow(4), prospectRow(5)];
    const rows = await listProspectsForExport([WS]);
    expect(rows.find((r) => r.id === "p00004")?.researchedAt).toBe("2026-09-05T00:00:00Z");
    expect(rows.find((r) => r.id === "p00005")?.researchedAt).toBeNull();
  });

  it("reads nothing for no workspaces", async () => {
    expect(await listProspectsForExport([])).toEqual([]);
    expect(db.calls).toHaveLength(0);
  });
});

describe("getProspectCountsForExport (EXP-DISC-01)", () => {
  it("counts every status per workspace without the row cap", async () => {
    db.tables.prospects = [
      ...Array.from({ length: 1500 }, (_, i) => ({ id: `a${i}`, workspace_id: WS, status: i < 500 ? "qualified" : "new" })),
      { id: "b1", workspace_id: "ws-2", status: "disqualified" },
    ];
    const counts = await getProspectCountsForExport([WS, "ws-2"]);
    expect(counts[WS]).toEqual({ total: 1500, new: 1000, qualified: 500, disqualified: 0 });
    expect(counts["ws-2"]).toEqual({ total: 1, new: 0, qualified: 0, disqualified: 1 });
  });
});

describe("listPipelineRunsForExport (EXP-DISC-12)", () => {
  it("reads every run of the workspace, not only the page's latest 50", async () => {
    db.tables.pipeline_runs = Array.from({ length: 1200 }, (_, i) => ({ id: `r${i}`, workspace_id: WS }));
    expect(await listPipelineRunsForExport(WS)).toHaveLength(1200);
    const ops = db.calls.map((c) => [c.op, ...c.args]);
    expect(ops).toContainEqual(["eq", "workspace_id", WS]);
    expect(ops).toContainEqual(["order", "started_at", { ascending: false }]);
    expect(ops.some(([op]) => op === "limit")).toBe(false);
  });
});

describe("getPerformanceAnalysisRawDataForExport (EXP-DISC-11)", () => {
  it("reads the page's four workspace-scoped tables, uncapped", async () => {
    db.tables.prospects = Array.from({ length: 1001 }, (_, i) => ({ id: `p${i}`, workspace_id: WS }));
    db.tables.signals = [{ id: "s1", workspace_id: WS }, { id: "s2", workspace_id: "other" }];
    db.tables.conversations = [];
    db.tables.contacts = [];
    db.tables.discovery_definitions = [];
    db.tables.opportunities = [];
    const raw = await getPerformanceAnalysisRawDataForExport(WS);
    expect(raw.prospects).toHaveLength(1001);
    expect(raw.signals.map((s) => s.id)).toEqual(["s1"]);
    const tables = new Set(db.calls.filter((c) => c.op === "eq").map((c) => `${c.table}:${String(c.args[0])}=${String(c.args[1])}`));
    expect(tables).toEqual(
      new Set([
        `prospects:workspace_id=${WS}`,
        `signals:workspace_id=${WS}`,
        `conversations:workspace_id=${WS}`,
        `contacts:workspace_id=${WS}`,
        `discovery_definitions:workspace_id=${WS}`,
        `opportunities:workspace_id=${WS}`,
      ]),
    );
  });
});
