import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, eqFilters, type RecordedQuery } from "@cofounderai/core/test-support/fake-supabase";

// EXP-FSM-01..09 -- the export-only reads behind every Service export: the same
// predicates as the pages' own queries, paged past PostgREST's 1,000-row cap, id lookups
// chunked, and the tenant always the business the runner resolved.

type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ core: {} as Record<string, Row[]>, fsm: {} as Record<string, Row[]> }));

/** A very small PostgREST stand-in: applies the filters, order and range a chain
 * recorded, so paging and tenant predicates are exercised for real. */
function run(call: RecordedQuery, tables: Record<string, Row[]>) {
  let rows = [...(tables[call.table] ?? [])];
  const orders: [string, boolean][] = [];
  let range: [number, number] | null = null;
  for (const { method, args } of call.ops) {
    const [col, val, extra] = args as [string, unknown, unknown];
    if (method === "eq") rows = rows.filter((r) => r[col] === val);
    else if (method === "in") rows = rows.filter((r) => (val as unknown[]).includes(r[col]));
    else if (method === "gte") rows = rows.filter((r) => r[col] != null && String(r[col]) >= String(val));
    else if (method === "lte") rows = rows.filter((r) => r[col] != null && String(r[col]) <= String(val));
    else if (method === "lt") rows = rows.filter((r) => r[col] != null && String(r[col]) < String(val));
    else if (method === "not" && val === "is" && extra === null) rows = rows.filter((r) => r[col] != null);
    else if (method === "order") orders.push([col, (val as { ascending?: boolean })?.ascending !== false]);
    else if (method === "range") range = [args[0] as number, args[1] as number];
  }
  rows.sort((a, b) => {
    for (const [col, asc] of orders) {
      const x = String(a[col] ?? "");
      const y = String(b[col] ?? "");
      if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
    }
    return 0;
  });
  if (range) rows = rows.slice(range[0], range[1] + 1);
  return { data: rows, error: null };
}

const fakes = vi.hoisted(() => ({ core: null as unknown, fsm: null as unknown }));

vi.mock("../db/server", () => ({ createClient: async () => fakes.fsm }));
vi.mock("@cofounderai/core/db/server", () => ({
  createClient: async (options?: { schema?: string }) => (options?.schema === "fsm" ? fakes.fsm : fakes.core),
}));

import {
  agingBucket,
  chunked,
  describeEventsForExport,
  listBalanceReportsForExport,
  listCustomersForExport,
  listInvoicesForExport,
  listJobsCompletedForExport,
  listJobsForExport,
  listOpportunitiesForExport,
  listOwnTimeEntriesForExport,
  listPaymentsForExport,
  listRevenueReportsForExport,
  listTimeReportsForExport,
} from "./queries";
import type { ScheduleEventItem } from "../lib/events/types";

let core: ReturnType<typeof createFakeSupabase>;
let fsm: ReturnType<typeof createFakeSupabase>;

beforeEach(() => {
  db.core = {};
  db.fsm = {};
  core = createFakeSupabase({ query: (call) => run(call, db.core) });
  fsm = createFakeSupabase({ query: (call) => run(call, db.fsm) });
  fakes.core = core;
  fakes.fsm = fsm;
});

const id = (prefix: string, n: number) => `${prefix}-${String(n).padStart(5, "0")}`;

function invoiceDoc(n: number, extra: Row = {}): Row {
  return {
    id: id("doc", n),
    business_id: "biz-a",
    doc_type: "invoice",
    source_module: "fsm",
    number: `INV-${n}`,
    status: "issued",
    doc_date: "2026-09-01",
    due_date: "2026-09-15",
    party_id: "party-1",
    source_ref: { job_id: "job-1" },
    subtotal: 100,
    discount_amount: 0,
    shipping_amount: 0,
    cgst_amount: 9,
    sgst_amount: 9,
    igst_amount: 0,
    total_amount: 118,
    created_at: `2026-09-01T00:00:${String(n % 60).padStart(2, "0")}Z`,
    updated_at: "2026-09-01T00:00:00Z",
    ...extra,
  };
}

describe("chunked", () => {
  it("splits ids into bounded groups", () => {
    expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunked([], 2)).toEqual([]);
  });
});

describe("listInvoicesForExport (EXP-FSM-05)", () => {
  it("returns every invoice past the 1,000-row cap, only this business's, with balances", async () => {
    db.core.documents = [
      ...Array.from({ length: 2500 }, (_, i) => invoiceDoc(i)),
      invoiceDoc(9999, { business_id: "biz-b" }),
      invoiceDoc(9998, { source_module: "inventory" }),
      invoiceDoc(9997, { doc_type: "estimate" }),
    ];
    db.core.parties = [{ id: "party-1", name: "Asha Traders" }];
    db.core.document_balances = [{ document_id: id("doc", 0), balance_amount: 18 }];
    db.fsm.jobs = [{ id: "job-1", number: "JOB-1" }];

    const rows = await listInvoicesForExport("biz-a");

    expect(rows).toHaveLength(2500);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2500);
    const docQueries = core.queries("documents");
    expect(docQueries.length).toBe(3);
    for (const q of docQueries) expect(eqFilters(q)).toMatchObject({ business_id: "biz-a", doc_type: "invoice", source_module: "fsm" });
    // Id lookups are chunked, never one 2,500-id filter.
    for (const q of core.queries("document_balances")) {
      const inOp = q.ops.find((op) => op.method === "in");
      expect((inOp?.args[1] as string[]).length).toBeLessThanOrEqual(200);
    }
    const first = rows.find((r) => r.id === id("doc", 0))!;
    expect(first).toMatchObject({ party_name: "Asha Traders", job_number: "JOB-1", balance_amount: 18 });
    // A document without a balance row falls back to its total, as the page does.
    expect(rows.find((r) => r.id === id("doc", 1))!.balance_amount).toBe(118);
  });

  it("returns nothing for an empty business", async () => {
    expect(await listInvoicesForExport("biz-a")).toEqual([]);
  });
});

describe("listJobsForExport (EXP-FSM-03)", () => {
  beforeEach(() => {
    db.fsm.jobs = [
      { id: "job-1", business_id: "biz-a", number: "JOB-1", party_id: "party-1", service_type_id: "st-1", opportunity_id: "opp-1", status: "scheduled", created_at: "2026-09-02T00:00:00Z" },
      { id: "job-2", business_id: "biz-a", number: "JOB-2", party_id: "party-1", service_type_id: null, opportunity_id: null, status: "unscheduled", created_at: "2026-09-01T00:00:00Z" },
      { id: "job-x", business_id: "biz-b", number: "OTHER", party_id: "party-x", service_type_id: null, opportunity_id: null, status: "unscheduled", created_at: "2026-09-01T00:00:00Z" },
    ];
    db.fsm.service_types = [{ id: "st-1", name: "AC service" }];
    db.fsm.opportunities = [{ id: "opp-1", source: "contact_form" }];
    db.fsm.events = [
      { id: "ev-late", business_id: "biz-a", job_id: "job-1", kind: "work", status: "scheduled", starts_at: "2026-09-10T09:00:00Z" },
      { id: "ev-early", business_id: "biz-a", job_id: "job-1", kind: "work", status: "done", starts_at: "2026-09-05T09:00:00Z" },
      { id: "ev-cancelled", business_id: "biz-a", job_id: "job-1", kind: "work", status: "cancelled", starts_at: "2026-09-01T09:00:00Z" },
      { id: "ev-reminder", business_id: "biz-a", job_id: "job-1", kind: "reminder", status: "scheduled", starts_at: "2026-09-02T09:00:00Z" },
    ];
    db.fsm.event_assignees = [
      { id: "a1", event_id: "ev-early", employee_id: "emp-1" },
      { id: "a2", event_id: "ev-late", employee_id: "emp-2" },
      { id: "a3", event_id: "ev-cancelled", employee_id: "emp-3" },
    ];
    db.core.parties = [{ id: "party-1", name: "Asha Traders" }];
    db.core.employees = [
      { id: "emp-1", user_id: "user-1" },
      { id: "emp-2", user_id: "user-2" },
      { id: "emp-3", user_id: "user-3" },
    ];
    db.core.user_profiles = [
      { id: "user-1", full_name: "Ravi", email: "ravi@example.com" },
      { id: "user-2", full_name: null, email: "meena@example.com" },
      { id: "user-3", full_name: "Cancelled Tech", email: null },
    ];
    db.core.documents = [invoiceDoc(1, { source_ref: { job_id: "job-1" }, total_amount: 500 }), invoiceDoc(2, { source_ref: { job_id: "job-1" }, total_amount: 250 })];
  });

  it("adds technician, scheduled date, value and source from the job's own records", async () => {
    const rows = await listJobsForExport("biz-a");
    expect(rows.map((r) => r.id)).toEqual(["job-1", "job-2"]);
    const [job1, job2] = rows;
    expect(job1).toMatchObject({
      party_name: "Asha Traders",
      service_type_name: "AC service",
      technician_names: ["Ravi", "meena@example.com"],
      scheduled_start: "2026-09-05T09:00:00Z",
      opportunity_source: "contact_form",
      invoiced_amount: 750,
    });
    // Blank stays blank: no visit, no source, no invoice.
    expect(job2).toMatchObject({ technician_names: [], scheduled_start: null, opportunity_source: null, invoiced_amount: null, service_type_name: null });
    for (const q of fsm.queries("jobs").filter((q) => q.ops.some((op) => op.method === "eq"))) {
      expect(eqFilters(q).business_id).toBe("biz-a");
    }
  });
});

describe("listOpportunitiesForExport (EXP-FSM-04)", () => {
  it("values an opportunity at its latest estimate, blank without one", async () => {
    db.fsm.opportunities = [
      { id: "opp-1", business_id: "biz-a", number: "OPP-1", party_id: "party-1", service_type_id: null, status: "estimate_sent", created_at: "2026-09-02T00:00:00Z" },
      { id: "opp-2", business_id: "biz-a", number: "OPP-2", party_id: "party-1", service_type_id: null, status: "new", created_at: "2026-09-01T00:00:00Z" },
    ];
    db.core.parties = [{ id: "party-1", name: "Asha Traders" }];
    db.core.documents = [
      { id: "est-old", business_id: "biz-a", doc_type: "estimate", source_module: "fsm", number: "EST-1", total_amount: 100, source_ref: { opportunity_id: "opp-1" }, created_at: "2026-09-01T00:00:00Z" },
      { id: "est-new", business_id: "biz-a", doc_type: "estimate", source_module: "fsm", number: "EST-2", total_amount: 300, source_ref: { opportunity_id: "opp-1" }, created_at: "2026-09-03T00:00:00Z" },
      { id: "est-other", business_id: "biz-b", doc_type: "estimate", source_module: "fsm", number: "X", total_amount: 999, source_ref: { opportunity_id: "opp-2" }, created_at: "2026-09-03T00:00:00Z" },
    ];
    const rows = await listOpportunitiesForExport("biz-a");
    expect(rows.find((r) => r.id === "opp-1")).toMatchObject({ estimate_number: "EST-2", estimate_total: 300 });
    expect(rows.find((r) => r.id === "opp-2")).toMatchObject({ estimate_number: null, estimate_total: null });
  });
});

describe("listCustomersForExport (EXP-FSM-02)", () => {
  it("counts service history, open work and outstanding balance per customer", async () => {
    db.core.party_roles = [
      { id: "r1", business_id: "biz-a", party_id: "party-2", role: "customer" },
      { id: "r2", business_id: "biz-a", party_id: "party-1", role: "customer" },
      { id: "r3", business_id: "biz-a", party_id: "party-3", role: "supplier" },
      { id: "r4", business_id: "biz-b", party_id: "party-x", role: "customer" },
    ];
    db.core.parties = [
      { id: "party-1", name: "Asha Traders", email: "asha@example.com", phone: null, is_active: true, created_at: "2026-01-01T00:00:00Z" },
      { id: "party-2", name: "Zen Clinic", email: null, phone: "999", is_active: false, created_at: "2026-02-01T00:00:00Z" },
    ];
    db.core.party_contacts = [
      { id: "c1", party_id: "party-1", first_name: "Kiran", last_name: "S", email: "kiran@example.com", phone: null, is_primary: false, status: "active" },
      { id: "c2", party_id: "party-1", first_name: "Anu", last_name: null, email: null, phone: "123", is_primary: true, status: "active" },
      { id: "c3", party_id: "party-1", first_name: "Old", last_name: null, email: null, phone: null, is_primary: false, status: "inactive" },
    ];
    db.core.addresses = [
      { id: "ad1", party_id: "party-1", kind: "billing", is_primary: true, formatted: "1 Billing Rd", city: null, state: null, postal_code: null, country: null },
      { id: "ad2", party_id: "party-1", kind: "service", is_primary: true, formatted: null, city: "Pune", state: "MH", postal_code: "411001", country: null },
    ];
    db.fsm.jobs = [
      { id: "j1", business_id: "biz-a", party_id: "party-1", status: "completed" },
      { id: "j2", business_id: "biz-a", party_id: "party-1", status: "in_progress" },
      { id: "j3", business_id: "biz-a", party_id: "party-1", status: "cancelled" },
      { id: "j4", business_id: "biz-b", party_id: "party-1", status: "in_progress" },
    ];
    db.fsm.opportunities = [
      { id: "o1", business_id: "biz-a", party_id: "party-1", status: "new" },
      { id: "o2", business_id: "biz-a", party_id: "party-1", status: "won" },
    ];
    db.core.documents = [invoiceDoc(1, { party_id: "party-1" }), invoiceDoc(2, { party_id: "party-1" }), invoiceDoc(3, { party_id: "party-2" })];
    db.core.document_balances = [
      { document_id: id("doc", 1), balance_amount: 100 },
      { document_id: id("doc", 2), balance_amount: -5 },
      { document_id: id("doc", 3), balance_amount: 0 },
    ];

    const rows = await listCustomersForExport("biz-a");
    expect(rows.map((r) => r.name)).toEqual(["Asha Traders", "Zen Clinic"]);
    expect(rows[0]).toMatchObject({
      contacts: ["Anu (123)", "Kiran S (kiran@example.com)"],
      address: "Pune, MH, 411001",
      job_count: 3,
      completed_job_count: 1,
      open_job_count: 1,
      open_opportunity_count: 1,
      outstanding_balance: 100,
    });
    expect(rows[1]).toMatchObject({ contacts: [], address: null, job_count: 0, open_job_count: 0, outstanding_balance: 0 });
    expect(eqFilters(core.queries("party_roles")[0]!)).toMatchObject({ business_id: "biz-a", role: "customer" });
  });
});

describe("describeEventsForExport (EXP-FSM-06/07)", () => {
  it("names technicians and places each event at its service address, else the customer's", async () => {
    db.fsm.jobs = [{ id: "job-1", party_id: "party-1", service_address_id: "ad-svc", completed_at: "2026-09-05T10:00:00Z" }];
    db.fsm.opportunities = [{ id: "opp-1", party_id: "party-2", service_address_id: null }];
    db.core.addresses = [
      { id: "ad-svc", party_id: "party-1", kind: "service", is_primary: false, formatted: "Site 4, Pune", city: null, state: null, postal_code: null, country: null },
      { id: "ad-2", party_id: "party-2", kind: "billing", is_primary: true, formatted: "HQ, Mumbai", city: null, state: null, postal_code: null, country: null },
    ];
    db.core.employees = [{ id: "emp-1", user_id: "user-1" }];
    db.core.user_profiles = [{ id: "user-1", full_name: "Ravi", email: null }];
    const events = [
      { id: "ev-1", job_id: "job-1", opportunity_id: null, assignee_employee_ids: ["emp-1"] },
      { id: "ev-2", job_id: null, opportunity_id: "opp-1", assignee_employee_ids: [] },
    ] as unknown as ScheduleEventItem[];

    const details = await describeEventsForExport(events);
    expect(details.get("ev-1")).toEqual({ technician_names: ["Ravi"], location: "Site 4, Pune", job_completed_at: "2026-09-05T10:00:00Z" });
    expect(details.get("ev-2")).toEqual({ technician_names: [], location: "HQ, Mumbai", job_completed_at: null });
  });
});

describe("listOwnTimeEntriesForExport (EXP-FSM-07)", () => {
  it("reads only the one technician's entries, in this business and window", async () => {
    db.fsm.time_entries = [
      { id: "t1", business_id: "biz-a", employee_id: "emp-me", job_id: "job-1", started_at: "2026-09-26T04:00:00.000Z", ended_at: "2026-09-26T05:00:00.000Z", duration_minutes: 60, is_billable: true, notes: null },
      { id: "t2", business_id: "biz-a", employee_id: "emp-other", job_id: "job-1", started_at: "2026-09-26T04:00:00.000Z", ended_at: null, duration_minutes: null, is_billable: true, notes: null },
      { id: "t3", business_id: "biz-b", employee_id: "emp-me", job_id: "job-9", started_at: "2026-09-26T04:00:00.000Z", ended_at: null, duration_minutes: null, is_billable: true, notes: null },
      { id: "t4", business_id: "biz-a", employee_id: "emp-me", job_id: "job-1", started_at: "2026-09-25T04:00:00.000Z", ended_at: null, duration_minutes: null, is_billable: true, notes: null },
    ];
    db.fsm.jobs = [{ id: "job-1", number: "JOB-1", party_id: "party-1" }];
    db.core.parties = [{ id: "party-1", name: "Asha Traders" }];

    const rows = await listOwnTimeEntriesForExport("biz-a", "emp-me", "2026-09-26T00:00:00.000Z", "2026-09-27T00:00:00.000Z");
    expect(rows.map((r) => r.id)).toEqual(["t1"]);
    expect(rows[0]).toMatchObject({ job_number: "JOB-1", customer: "Asha Traders" });
    expect(eqFilters(fsm.queries("time_entries")[0]!)).toEqual({ business_id: "biz-a", employee_id: "emp-me" });
  });
});

describe("report queries (EXP-FSM-08)", () => {
  it("jobs completed: in the period, with the report's own invoiced figure", async () => {
    db.fsm.jobs = [
      { id: "j1", business_id: "biz-a", number: "JOB-1", party_id: "party-1", service_type_id: null, status: "completed", completed_at: "2026-09-10T10:00:00Z" },
      { id: "j2", business_id: "biz-a", number: "JOB-2", party_id: "party-1", service_type_id: null, status: "completed", completed_at: "2026-07-10T10:00:00Z" },
      { id: "j3", business_id: "biz-a", number: "JOB-3", party_id: "party-1", service_type_id: null, status: "in_progress", completed_at: null },
    ];
    db.core.parties = [{ id: "party-1", name: "Asha Traders" }];
    db.core.documents = [invoiceDoc(1, { source_ref: { job_id: "j1" }, total_amount: 400 })];
    const rows = await listJobsCompletedForExport("biz-a", { from: "2026-09-01", to: "2026-09-30" });
    expect(rows).toEqual([
      { id: "j1", number: "JOB-1", party_name: "Asha Traders", service_type_name: null, completed_at: "2026-09-10T10:00:00Z", invoiced_amount: 400 },
    ]);
  });

  it("revenue: grouped by service, tag, charge type and marketing source", async () => {
    db.core.documents = [
      invoiceDoc(1, { source_ref: { job_id: "j1" }, total_amount: 300, doc_date: "2026-09-02" }),
      invoiceDoc(2, { source_ref: {}, total_amount: 50, doc_date: "2026-09-03" }),
      invoiceDoc(3, { source_ref: { job_id: "j1" }, total_amount: 999, doc_date: "2026-06-01" }),
    ];
    db.fsm.jobs = [{ id: "j1", service_type_id: "st-1", opportunity_id: "opp-1" }];
    db.fsm.service_types = [{ id: "st-1", name: "AC service" }];
    db.fsm.opportunities = [{ id: "opp-1", marketing_source_id: null }];
    db.core.taggings = [
      { id: "tg1", business_id: "biz-a", taggable_type: "job", taggable_id: "j1", tag_id: "tag-1" },
      { id: "tg2", business_id: "biz-a", taggable_type: "job", taggable_id: "j1", tag_id: "tag-2" },
    ];
    db.core.tags = [
      { id: "tag-1", name: "Emergency" },
      { id: "tag-2", name: "Repeat" },
    ];
    db.core.document_lines = [
      { id: "l1", document_id: id("doc", 1), job_charge_type_id: "ct-1", quantity: 2, unit_price: 100, cgst_amount: 9, sgst_amount: 9, igst_amount: 0 },
      { id: "l2", document_id: id("doc", 2), job_charge_type_id: null, quantity: 1, unit_price: 50, cgst_amount: 0, sgst_amount: 0, igst_amount: 0 },
    ];
    db.fsm.job_charge_types = [{ id: "ct-1", name: "Labour" }];

    const r = await listRevenueReportsForExport("biz-a", { from: "2026-09-01", to: "2026-09-30" });
    expect(r.byService).toEqual([
      { label: "AC service", revenue: 300 },
      { label: "Unspecified", revenue: 50 },
    ]);
    expect(r.byTag).toEqual([
      { label: "Emergency", revenue: 300 },
      { label: "Repeat", revenue: 300 },
      { label: "Untagged", revenue: 50 },
    ]);
    expect(r.byChargeType).toEqual([
      { label: "Labour", revenue: 218 },
      { label: "Unspecified", revenue: 50 },
    ]);
    expect(r.byMarketingSource).toEqual([{ label: "Unattributed", revenue: 350 }]);
  });

  it("balances and aging: positive balances only, bucketed by days past due", async () => {
    const past = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    db.core.documents = [
      invoiceDoc(1, { party_id: "party-1", due_date: past(45) }),
      invoiceDoc(2, { party_id: "party-1", due_date: null, doc_date: past(5) }),
      invoiceDoc(3, { party_id: "party-2", due_date: past(100) }),
    ];
    db.core.document_balances = [
      { document_id: id("doc", 1), balance_amount: 100 },
      { document_id: id("doc", 2), balance_amount: 20 },
      { document_id: id("doc", 3), balance_amount: 0 },
    ];
    db.core.parties = [{ id: "party-1", name: "Asha Traders" }];
    const { customerBalances, aging } = await listBalanceReportsForExport("biz-a");
    expect(customerBalances).toEqual([{ party_id: "party-1", party_name: "Asha Traders", balance_amount: 120 }]);
    expect(aging.map((a) => [a.number, a.aging_bucket])).toEqual([
      ["INV-1", "31-60"],
      ["INV-2", "1-30"],
    ]);
    expect([0, 1, 30, 31, 60, 61, 90, 91].map(agingBucket)).toEqual(["current", "1-30", "1-30", "31-60", "31-60", "61-90", "61-90", "90+"]);
  });

  it("payments: allocated to fsm documents, in the period, newest first", async () => {
    db.core.documents = [
      { id: "d1", business_id: "biz-a", source_module: "fsm" },
      { id: "d2", business_id: "biz-a", source_module: "inventory" },
    ];
    db.core.payment_allocations = [
      { id: "pa1", payment_id: "p1", document_id: "d1" },
      { id: "pa2", payment_id: "p2", document_id: "d1" },
      { id: "pa3", payment_id: "p3", document_id: "d2" },
      { id: "pa4", payment_id: "p4", document_id: "d1" },
    ];
    db.core.payments = [
      { id: "p1", party_id: "party-1", method: "upi", amount: 100, payment_date: "2026-09-05", reference: "UTR1" },
      { id: "p2", party_id: "party-1", method: "cash", amount: 50, payment_date: "2026-09-20", reference: null },
      { id: "p3", party_id: "party-1", method: "cash", amount: 70, payment_date: "2026-09-10", reference: null },
      { id: "p4", party_id: "party-1", method: "cash", amount: 10, payment_date: "2026-08-01", reference: null },
    ];
    db.core.parties = [{ id: "party-1", name: "Asha Traders" }];
    const rows = await listPaymentsForExport("biz-a", { from: "2026-09-01", to: "2026-09-30" });
    expect(rows.map((p) => [p.id, p.amount, p.document_id])).toEqual([
      ["p2", 50, "d1"],
      ["p1", 100, "d1"],
    ]);
  });

  it("timecards and productivity: per employee, rounded hours, report naming", async () => {
    db.fsm.time_entries = [
      { id: "t1", business_id: "biz-a", employee_id: "emp-1", job_id: "j1", duration_minutes: 90, is_billable: true, started_at: "2026-09-02T04:00:00Z" },
      { id: "t2", business_id: "biz-a", employee_id: "emp-1", job_id: "j2", duration_minutes: 30, is_billable: false, started_at: "2026-09-03T04:00:00Z" },
      { id: "t3", business_id: "biz-a", employee_id: "emp-2", job_id: "j1", duration_minutes: 20, is_billable: true, started_at: "2026-09-03T04:00:00Z" },
      { id: "t4", business_id: "biz-a", employee_id: "emp-2", job_id: "j1", duration_minutes: null, is_billable: true, started_at: "2026-09-03T04:00:00Z" },
    ];
    db.fsm.jobs = [
      { id: "j1", status: "completed" },
      { id: "j2", status: "in_progress" },
    ];
    db.core.employees = [
      { id: "emp-1", user_id: "user-1" },
      { id: "emp-2", user_id: null },
    ];
    db.core.user_profiles = [{ id: "user-1", full_name: "Ravi", email: null }];
    const { timecards, productivity } = await listTimeReportsForExport("biz-a", {});
    expect(timecards).toEqual([
      { employee_name: "Ravi", total_hours: 2, billable_hours: 1.5, entry_count: 2 },
      { employee_name: "Unknown", total_hours: 0.33, billable_hours: 0.33, entry_count: 1 },
    ]);
    expect(productivity).toEqual([
      { employee_name: "Ravi", jobs_completed: 1, total_hours: 2 },
      { employee_name: "Unknown", jobs_completed: 1, total_hours: 0.33 },
    ]);
  });
});
