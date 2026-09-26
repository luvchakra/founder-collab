import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { fetchAllRows } from "@cofounderai/core/exports/fetch-all";
import type { PaymentMethod } from "@cofounderai/core/payments/types";
import { createClient as createFsmClient } from "../db/server";
import type { EventKind, EventStatus, ScheduleEventItem } from "../lib/events/types";
import type { Invoice, InvoiceListItem } from "../lib/invoices/types";
import type { JobListItem, JobStatus } from "../lib/jobs/types";
import type { OpportunityListItem, OpportunitySource } from "../lib/opportunities/types";
import type {
  AgingRow,
  CustomerBalanceRow,
  JobsCompletedRow,
  MarketingSourceRevenueRow,
  PaymentRow,
  ProductivityRow,
  ReportDateRange,
  RevenueByGroupRow,
  TimecardRow,
} from "../lib/reports/types";

/**
 * EXP-FSM-01..09 -- export-only reads for Service (§36, §37, docs/design/data-exports.md
 * rule 1).
 *
 * Every list query the Service pages use is an unbounded `.select()`, so PostgREST's
 * `max-rows` (1,000 on Supabase) silently caps it -- and the `.in("id", [...])` lookups
 * behind each join are capped the same way. The functions here apply exactly the same
 * predicates as the page's own query (each one names it), but page through with
 * `fetchAllRows` in a stable order ending in a unique column, and split every id lookup
 * into bounded chunks. The page's own queries are left as they are.
 *
 * The tenant is always the `businessId` argument -- the export runner resolves it
 * server-side from the URL slug -- and every read goes through the same RLS-scoped
 * clients the pages use, so row-level access stays with the database.
 */

// Untyped like every other `.from(table)` caller against these schemas (Database = any).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryBuilder = any;

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** How many ids go into one `.in(...)` filter -- keeps the request URL well inside
 * PostgREST's limits however many rows the export has. */
export const ID_CHUNK_SIZE = 200;

export function chunked<T>(items: readonly T[], size = ID_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function uniqueIds(ids: readonly (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

/** Every row of `table` whose `column` is one of `ids`: one bounded `.in()` per chunk,
 * each paged to the end, ordered by `orderBy` (a unique column). `narrow` adds the
 * caller's own extra predicates. */
async function selectIn<T>(
  client: QueryBuilder,
  table: string,
  columns: string,
  column: string,
  ids: readonly (string | null | undefined)[],
  options: { orderBy?: string; narrow?: (query: QueryBuilder) => QueryBuilder } = {},
): Promise<T[]> {
  const rows: T[] = [];
  for (const part of chunked(uniqueIds(ids))) {
    const batch = await fetchAllRows<T>((from, to) => {
      const base = client.from(table).select(columns).in(column, part);
      return (options.narrow ? options.narrow(base) : base).order(options.orderBy ?? "id", { ascending: true }).range(from, to);
    });
    rows.push(...batch);
  }
  return rows;
}

/** Same as reports/queries.ts#withDateRange -- `date` columns, inclusive both ends. */
function withDateRange(query: QueryBuilder, column: string, range?: ReportDateRange): QueryBuilder {
  let q = query;
  if (range?.from) q = q.gte(column, range.from);
  if (range?.to) q = q.lte(column, range.to);
  return q;
}

/** Same as reports/queries.ts#withTimestampRange -- `timestamptz` columns, `to` pushed to
 * the end of that day. */
function withTimestampRange(query: QueryBuilder, column: string, range?: ReportDateRange): QueryBuilder {
  let q = query;
  if (range?.from) q = q.gte(column, `${range.from}T00:00:00.000Z`);
  if (range?.to) q = q.lte(column, `${range.to}T23:59:59.999Z`);
  return q;
}

/** Same default as reports/queries.ts#defaultToCurrentMonth. */
function defaultToCurrentMonth(): ReportDateRange {
  const monthStart = new Date();
  monthStart.setDate(1);
  return { from: monthStart.toISOString().slice(0, 10) };
}

type NamedRow = { id: string; name: string };

async function partyNamesById(partyIds: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const core = await coreClient();
  const parties = await selectIn<NamedRow>(core, "parties", "id, name", "id", partyIds);
  return new Map(parties.map((p) => [p.id, p.name]));
}

async function serviceTypeNamesById(serviceTypeIds: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const fsm = await createFsmClient();
  const rows = await selectIn<NamedRow>(fsm, "service_types", "id, name", "id", serviceTypeIds);
  return new Map(rows.map((s) => [s.id, s.name]));
}

type EmployeeRow = { id: string; user_id: string | null };
type ProfileRow = { id: string; full_name: string | null; email: string | null };

/** `core.employees` has no name of its own -- joined to `core.user_profiles`, as
 * employees/queries.ts does. Returns the profile for each employee id. */
async function profilesByEmployeeId(employeeIds: readonly string[]): Promise<Map<string, ProfileRow | undefined>> {
  const core = await coreClient();
  const employees = await selectIn<EmployeeRow>(core, "employees", "id, user_id", "id", employeeIds);
  const profiles = await selectIn<ProfileRow>(core, "user_profiles", "id, full_name, email", "id", employees.map((e) => e.user_id));
  const profileByUserId = new Map(profiles.map((p) => [p.id, p]));
  return new Map(employees.map((e) => [e.id, e.user_id ? profileByUserId.get(e.user_id) : undefined]));
}

/** A technician's name the way the Schedule page shows it: full name, else email, else
 * "Unnamed". */
export async function technicianNamesById(employeeIds: readonly string[]): Promise<Map<string, string>> {
  const profiles = await profilesByEmployeeId(employeeIds);
  return new Map(employeeIds.map((id) => [id, profiles.get(id)?.full_name || profiles.get(id)?.email || "Unnamed"]));
}

// ---------------------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------------------

type AddressRow = {
  id: string;
  party_id: string;
  kind: string;
  is_primary: boolean;
  formatted: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
};

const ADDRESS_COLUMNS = "id, party_id, kind, is_primary, formatted, city, state, postal_code, country";

/** One line of text for an address: its own formatted line when it has one, otherwise
 * the parts it does have. Blank when there's nothing on file. */
export function addressText(address: Pick<AddressRow, "formatted" | "city" | "state" | "postal_code" | "country"> | null | undefined): string | null {
  if (!address) return null;
  if (address.formatted) return address.formatted;
  const parts = [address.city, address.state, address.postal_code, address.country].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(", ") : null;
}

/** A customer's own address to show when a job has none of its own: the primary service
 * address, then the primary billing address, then any other primary address. */
function primaryAddress(addresses: AddressRow[]): AddressRow | undefined {
  const primary = addresses.filter((a) => a.is_primary);
  return primary.find((a) => a.kind === "service") ?? primary.find((a) => a.kind === "billing") ?? primary[0];
}

async function addressesForParties(partyIds: readonly string[]): Promise<Map<string, AddressRow[]>> {
  const core = await coreClient();
  const rows = await selectIn<AddressRow>(core, "addresses", ADDRESS_COLUMNS, "party_id", partyIds);
  const byParty = new Map<string, AddressRow[]>();
  for (const a of rows) byParty.set(a.party_id, [...(byParty.get(a.party_id) ?? []), a]);
  return byParty;
}

// ---------------------------------------------------------------------------------------
// Invoices (EXP-FSM-05, and the money behind EXP-FSM-01/02/08)
// ---------------------------------------------------------------------------------------

const INVOICE_SELECT =
  "id, number, status, doc_date, due_date, party_id, source_ref, subtotal, discount_amount, shipping_amount, cgst_amount, sgst_amount, igst_amount, total_amount, created_at, updated_at";

type InvoiceDocRow = Record<string, unknown> & { id: string; party_id: string; source_ref: unknown };

/** Mirrors invoices/queries.ts#toInvoice. */
function toInvoice(row: Record<string, unknown>): Invoice {
  const sourceRef = (row.source_ref as { job_id?: string }) ?? {};
  return {
    id: row.id as string,
    number: row.number as string | null,
    status: row.status as Invoice["status"],
    doc_date: row.doc_date as string,
    due_date: row.due_date as string | null,
    job_id: sourceRef.job_id ?? "",
    party_id: row.party_id as string,
    subtotal: Number(row.subtotal),
    discount_amount: Number(row.discount_amount),
    shipping_amount: Number(row.shipping_amount),
    cgst_amount: Number(row.cgst_amount),
    sgst_amount: Number(row.sgst_amount),
    igst_amount: Number(row.igst_amount),
    total_amount: Number(row.total_amount),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function jobIdOf(sourceRef: unknown): string | undefined {
  return (sourceRef as { job_id?: string } | null)?.job_id;
}

/** Every fsm-issued invoice document for the business -- the predicates of
 * invoices/queries.ts#listInvoices (and every report built on it), newest first. */
async function listFsmInvoiceDocs(businessId: string, columns: string, range?: ReportDateRange): Promise<InvoiceDocRow[]> {
  const core = await coreClient();
  return fetchAllRows<InvoiceDocRow>((from, to) =>
    withDateRange(
      core.from("documents").select(columns).eq("business_id", businessId).eq("doc_type", "invoice").eq("source_module", "fsm"),
      "doc_date",
      range,
    )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
}

type BalanceRow = { document_id: string; balance_amount: number | string };

/** Live balances (`core.document_balances`, D-7) for many documents in a few requests --
 * the same view `getDocumentBalance()` reads one document at a time. */
async function balancesByDocumentId(documentIds: readonly string[]): Promise<Map<string, number>> {
  const core = await coreClient();
  const rows = await selectIn<BalanceRow>(core, "document_balances", "document_id, balance_amount", "document_id", documentIds, {
    orderBy: "document_id",
  });
  return new Map(rows.map((b) => [b.document_id, Number(b.balance_amount)]));
}

/** EXP-FSM-05 -- invoices/queries.ts#listInvoices, every row. */
export async function listInvoicesForExport(businessId: string): Promise<InvoiceListItem[]> {
  const docs = await listFsmInvoiceDocs(businessId, INVOICE_SELECT);
  if (docs.length === 0) return [];
  const invoices = docs.map(toInvoice);

  const fsm = await createFsmClient();
  const [jobs, partyNames, balances] = await Promise.all([
    selectIn<{ id: string; number: string | null }>(fsm, "jobs", "id, number", "id", invoices.map((i) => i.job_id)),
    partyNamesById(invoices.map((i) => i.party_id)),
    balancesByDocumentId(invoices.map((i) => i.id)),
  ]);
  const jobNumberById = new Map(jobs.map((j) => [j.id, j.number]));

  return invoices.map((invoice) => ({
    ...invoice,
    party_name: partyNames.get(invoice.party_id) ?? "Unknown customer",
    job_number: invoice.job_id ? jobNumberById.get(invoice.job_id) ?? null : null,
    balance_amount: balances.get(invoice.id) ?? invoice.total_amount,
  }));
}

// ---------------------------------------------------------------------------------------
// Jobs (EXP-FSM-03, and EXP-FSM-01's job figures)
// ---------------------------------------------------------------------------------------

type JobRow = Omit<JobListItem, "party_name" | "service_type_name">;

/** jobs/queries.ts#listJobs, every row: the business's jobs, newest first, with customer
 * and service-type names. */
export async function listJobRowsForExport(businessId: string): Promise<JobListItem[]> {
  const fsm = await createFsmClient();
  const jobs = await fetchAllRows<JobRow>((from, to) =>
    fsm
      .from("jobs")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
  if (jobs.length === 0) return [];

  const [partyNames, serviceTypeNames] = await Promise.all([
    partyNamesById(jobs.map((j) => j.party_id)),
    serviceTypeNamesById(jobs.map((j) => j.service_type_id)),
  ]);
  return jobs.map((j) => ({
    ...j,
    party_name: partyNames.get(j.party_id) ?? "Unknown customer",
    service_type_name: j.service_type_id ? serviceTypeNames.get(j.service_type_id) ?? null : null,
  }));
}

export type JobExportRow = JobListItem & {
  /** Everyone assigned to the job's (non-cancelled) work visits, by name. */
  technician_names: string[];
  /** The first non-cancelled work visit's start -- when the job is (or was) scheduled. */
  scheduled_start: string | null;
  /** Where the job came from -- its originating opportunity's source. Null for a job
   * created directly. */
  opportunity_source: OpportunitySource | null;
  /** Sum of the job's invoices -- null when it has none (not zero). */
  invoiced_amount: number | null;
};

type JobEventRow = { id: string; job_id: string; kind: EventKind; status: EventStatus; starts_at: string };

/** EXP-FSM-03 -- every job, plus the story's fields the list page itself doesn't carry:
 * technician and scheduled date (from the job's schedule events), value (its invoices)
 * and source (its originating opportunity). */
export async function listJobsForExport(businessId: string): Promise<JobExportRow[]> {
  const jobs = await listJobRowsForExport(businessId);
  if (jobs.length === 0) return [];

  const fsm = await createFsmClient();
  const [events, opportunities, invoiceDocs] = await Promise.all([
    selectIn<JobEventRow>(fsm, "events", "id, job_id, kind, status, starts_at", "job_id", jobs.map((j) => j.id), {
      narrow: (q) => q.eq("business_id", businessId),
    }),
    selectIn<{ id: string; source: OpportunitySource }>(fsm, "opportunities", "id, source", "id", jobs.map((j) => j.opportunity_id)),
    listFsmInvoiceDocs(businessId, "id, total_amount, source_ref"),
  ]);

  const workEvents = events.filter((e) => e.kind === "work" && e.status !== "cancelled");
  const assignees = await selectIn<{ id: string; event_id: string; employee_id: string }>(
    fsm,
    "event_assignees",
    "id, event_id, employee_id",
    "event_id",
    workEvents.map((e) => e.id),
  );
  const names = await technicianNamesById(uniqueIds(assignees.map((a) => a.employee_id)));

  const employeeIdsByEvent = new Map<string, string[]>();
  for (const a of assignees) employeeIdsByEvent.set(a.event_id, [...(employeeIdsByEvent.get(a.event_id) ?? []), a.employee_id]);
  const eventsByJob = new Map<string, JobEventRow[]>();
  for (const e of workEvents) eventsByJob.set(e.job_id, [...(eventsByJob.get(e.job_id) ?? []), e]);
  const sourceByOpportunity = new Map(opportunities.map((o) => [o.id, o.source]));
  const invoicedByJob = new Map<string, number>();
  for (const d of invoiceDocs) {
    const jobId = jobIdOf(d.source_ref);
    if (jobId) invoicedByJob.set(jobId, (invoicedByJob.get(jobId) ?? 0) + Number(d.total_amount));
  }

  return jobs.map((job) => {
    const visits = [...(eventsByJob.get(job.id) ?? [])].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const technicianIds = uniqueIds(visits.flatMap((v) => employeeIdsByEvent.get(v.id) ?? []));
    return {
      ...job,
      technician_names: technicianIds.map((id) => names.get(id) ?? "Unnamed"),
      scheduled_start: visits[0]?.starts_at ?? null,
      opportunity_source: job.opportunity_id ? sourceByOpportunity.get(job.opportunity_id) ?? null : null,
      invoiced_amount: invoicedByJob.get(job.id) ?? null,
    };
  });
}

// ---------------------------------------------------------------------------------------
// Opportunities (EXP-FSM-04)
// ---------------------------------------------------------------------------------------

type OpportunityRow = Omit<OpportunityListItem, "party_name" | "service_type_name">;

/** opportunities/queries.ts#listOpportunities, every row. */
export async function listOpportunityRowsForExport(businessId: string): Promise<OpportunityListItem[]> {
  const fsm = await createFsmClient();
  const opportunities = await fetchAllRows<OpportunityRow>((from, to) =>
    fsm
      .from("opportunities")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
  if (opportunities.length === 0) return [];

  const [partyNames, serviceTypeNames] = await Promise.all([
    partyNamesById(opportunities.map((o) => o.party_id)),
    serviceTypeNamesById(opportunities.map((o) => o.service_type_id)),
  ]);
  return opportunities.map((o) => ({
    ...o,
    party_name: partyNames.get(o.party_id) ?? "Unknown customer",
    service_type_name: o.service_type_id ? serviceTypeNames.get(o.service_type_id) ?? null : null,
  }));
}

export type OpportunityExportRow = OpportunityListItem & {
  /** The opportunity's estimate (its latest, as estimates/queries.ts#getEstimateForOpportunity
   * picks it) -- the only value an FSM opportunity carries. Null when none was written. */
  estimate_number: string | null;
  estimate_total: number | null;
};

/** EXP-FSM-04 -- every opportunity, with its estimate's total as its value. */
export async function listOpportunitiesForExport(businessId: string): Promise<OpportunityExportRow[]> {
  const opportunities = await listOpportunityRowsForExport(businessId);
  if (opportunities.length === 0) return [];

  const core = await coreClient();
  const estimates = await fetchAllRows<{ id: string; number: string | null; total_amount: number | string; source_ref: unknown }>((from, to) =>
    core
      .from("documents")
      .select("id, number, total_amount, source_ref")
      .eq("business_id", businessId)
      .eq("doc_type", "estimate")
      .eq("source_module", "fsm")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
  // Newest first, so the first one seen per opportunity is the one its page shows.
  const estimateByOpportunity = new Map<string, { number: string | null; total: number }>();
  for (const e of estimates) {
    const opportunityId = (e.source_ref as { opportunity_id?: string } | null)?.opportunity_id;
    if (opportunityId && !estimateByOpportunity.has(opportunityId)) {
      estimateByOpportunity.set(opportunityId, { number: e.number, total: Number(e.total_amount) });
    }
  }

  return opportunities.map((o) => {
    const estimate = estimateByOpportunity.get(o.id);
    return { ...o, estimate_number: estimate?.number ?? null, estimate_total: estimate ? estimate.total : null };
  });
}

// ---------------------------------------------------------------------------------------
// Customers (EXP-FSM-02)
// ---------------------------------------------------------------------------------------

type ContactRow = {
  id: string;
  party_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  status: string;
};

export type CustomerExportRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  /** Active contacts, primary first: "Name (email, phone)". */
  contacts: string[];
  address: string | null;
  job_count: number;
  completed_job_count: number;
  open_job_count: number;
  open_opportunity_count: number;
  /** Sum of the customer's positive fsm invoice balances -- the Reports page's "Customer
   * balances" figure. */
  outstanding_balance: number;
};

function contactText(c: ContactRow): string | null {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
  const reach = [c.email, c.phone].filter(Boolean).join(", ");
  if (!name && !reach) return null;
  if (!name) return reach;
  return reach ? `${name} (${reach})` : name;
}

/** EXP-FSM-02 -- customers/queries.ts#listFsmCustomers (every party holding the
 * `customer` role, by name, with open job/opportunity counts), every row, plus contacts,
 * address, job history and the outstanding balance. */
export async function listCustomersForExport(businessId: string): Promise<CustomerExportRow[]> {
  const core = await coreClient();
  const roles = await fetchAllRows<{ id: string; party_id: string }>((from, to) =>
    core
      .from("party_roles")
      .select("id, party_id")
      .eq("business_id", businessId)
      .eq("role", "customer")
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (roles.length === 0) return [];
  const partyIds = uniqueIds(roles.map((r) => r.party_id));
  const customerIds = new Set(partyIds);

  const fsm = await createFsmClient();
  const [parties, contacts, addresses, jobs, opportunities, invoiceDocs] = await Promise.all([
    selectIn<{ id: string; name: string; email: string | null; phone: string | null; is_active: boolean; created_at: string }>(
      core,
      "parties",
      "id, name, email, phone, is_active, created_at",
      "id",
      partyIds,
    ),
    selectIn<ContactRow>(core, "party_contacts", "id, party_id, first_name, last_name, email, phone, is_primary, status", "party_id", partyIds),
    addressesForParties(partyIds),
    fetchAllRows<{ id: string; party_id: string; status: JobStatus }>((from, to) =>
      fsm.from("jobs").select("id, party_id, status").eq("business_id", businessId).order("id", { ascending: true }).range(from, to),
    ),
    fetchAllRows<{ id: string; party_id: string; status: string }>((from, to) =>
      fsm.from("opportunities").select("id, party_id, status").eq("business_id", businessId).order("id", { ascending: true }).range(from, to),
    ),
    listFsmInvoiceDocs(businessId, "id, party_id, source_ref"),
  ]);
  const balances = await balancesByDocumentId(invoiceDocs.map((d) => d.id));

  const count = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  const jobs_ = new Map<string, number>();
  const completed = new Map<string, number>();
  const openJobs = new Map<string, number>();
  for (const j of jobs) {
    if (!customerIds.has(j.party_id)) continue;
    count(jobs_, j.party_id);
    if (j.status === "completed") count(completed, j.party_id);
    if (j.status !== "completed" && j.status !== "cancelled") count(openJobs, j.party_id);
  }
  const openOpportunities = new Map<string, number>();
  for (const o of opportunities) {
    if (customerIds.has(o.party_id) && o.status !== "won" && o.status !== "lost") count(openOpportunities, o.party_id);
  }
  const outstanding = new Map<string, number>();
  for (const d of invoiceDocs) {
    const balance = balances.get(d.id) ?? 0;
    if (balance > 0) outstanding.set(d.party_id, (outstanding.get(d.party_id) ?? 0) + balance);
  }
  const contactsByParty = new Map<string, ContactRow[]>();
  for (const c of contacts) {
    if (c.status !== "active") continue;
    contactsByParty.set(c.party_id, [...(contactsByParty.get(c.party_id) ?? []), c]);
  }

  return parties
    .map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      is_active: p.is_active,
      created_at: p.created_at,
      contacts: [...(contactsByParty.get(p.id) ?? [])]
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
        .map(contactText)
        .filter((t): t is string => t !== null),
      address: addressText(primaryAddress(addresses.get(p.id) ?? [])),
      job_count: jobs_.get(p.id) ?? 0,
      completed_job_count: completed.get(p.id) ?? 0,
      open_job_count: openJobs.get(p.id) ?? 0,
      open_opportunity_count: openOpportunities.get(p.id) ?? 0,
      outstanding_balance: outstanding.get(p.id) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------------------
// Schedule events (EXP-FSM-01/06/07)
// ---------------------------------------------------------------------------------------

export type EventDetails = {
  technician_names: string[];
  location: string | null;
  /** When the event's job was completed -- blank for an opportunity's event or an open job. */
  job_completed_at: string | null;
};

/** What the schedule's own rows (events/queries.ts#listEventsForRange) don't carry:
 * technician names and a location -- the job's or opportunity's service address, else
 * the customer's own primary address. */
export async function describeEventsForExport(events: readonly ScheduleEventItem[]): Promise<Map<string, EventDetails>> {
  if (events.length === 0) return new Map();
  const fsm = await createFsmClient();
  const core = await coreClient();
  type Subject = { id: string; party_id: string; service_address_id: string | null; completed_at?: string | null };

  const [jobs, opportunities, names] = await Promise.all([
    selectIn<Subject>(fsm, "jobs", "id, party_id, service_address_id, completed_at", "id", events.map((e) => e.job_id)),
    selectIn<Subject>(fsm, "opportunities", "id, party_id, service_address_id", "id", events.map((e) => e.opportunity_id)),
    technicianNamesById(uniqueIds(events.flatMap((e) => e.assignee_employee_ids))),
  ]);
  const subjects = [...jobs, ...opportunities];
  const [serviceAddresses, partyAddresses] = await Promise.all([
    selectIn<AddressRow>(core, "addresses", ADDRESS_COLUMNS, "id", subjects.map((s) => s.service_address_id)),
    addressesForParties(uniqueIds(subjects.map((s) => s.party_id))),
  ]);
  const serviceAddressById = new Map(serviceAddresses.map((a) => [a.id, a]));
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const opportunityById = new Map(opportunities.map((o) => [o.id, o]));

  return new Map(
    events.map((e) => {
      const job = e.job_id ? jobById.get(e.job_id) : undefined;
      const subject = job ?? (e.opportunity_id ? opportunityById.get(e.opportunity_id) : undefined);
      const address = subject
        ? (subject.service_address_id ? serviceAddressById.get(subject.service_address_id) : undefined) ??
          primaryAddress(partyAddresses.get(subject.party_id) ?? [])
        : undefined;
      return [
        e.id,
        {
          technician_names: e.assignee_employee_ids.map((id) => names.get(id) ?? "Unnamed"),
          location: addressText(address),
          job_completed_at: job?.completed_at ?? null,
        },
      ];
    }),
  );
}

export type OwnTimeEntryRow = {
  id: string;
  job_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | string | null;
  is_billable: boolean;
  notes: string | null;
  job_number: string | null;
  customer: string | null;
};

/** EXP-FSM-07 -- one technician's own clock-ins that started in `[startsAtGte,
 * startsAtLt)`. `employeeId` must be the signed-in user's own employee row (My Day's
 * getCurrentEmployee); the query never widens past it. */
export async function listOwnTimeEntriesForExport(
  businessId: string,
  employeeId: string,
  startsAtGte: string,
  startsAtLt: string,
): Promise<OwnTimeEntryRow[]> {
  const fsm = await createFsmClient();
  const entries = await fetchAllRows<Omit<OwnTimeEntryRow, "job_number" | "customer">>((from, to) =>
    fsm
      .from("time_entries")
      .select("id, job_id, started_at, ended_at, duration_minutes, is_billable, notes")
      .eq("business_id", businessId)
      .eq("employee_id", employeeId)
      .gte("started_at", startsAtGte)
      .lt("started_at", startsAtLt)
      .order("started_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
  if (entries.length === 0) return [];
  const jobs = await selectIn<{ id: string; number: string | null; party_id: string }>(fsm, "jobs", "id, number, party_id", "id", entries.map((e) => e.job_id));
  const partyNames = await partyNamesById(jobs.map((j) => j.party_id));
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  return entries.map((e) => {
    const job = jobById.get(e.job_id);
    return { ...e, job_number: job?.number ?? null, customer: job ? partyNames.get(job.party_id) ?? "Unknown customer" : null };
  });
}

// ---------------------------------------------------------------------------------------
// Reports (EXP-FSM-08) -- each mirrors its reports/queries.ts namesake, same predicates,
// grouping, rounding and order.
// ---------------------------------------------------------------------------------------

/** listJobsCompletedReport, every row. */
export async function listJobsCompletedForExport(businessId: string, range?: ReportDateRange): Promise<JobsCompletedRow[]> {
  const fsm = await createFsmClient();
  const jobs = await fetchAllRows<{ id: string; number: string | null; party_id: string; service_type_id: string | null; completed_at: string | null }>(
    (from, to) =>
      withTimestampRange(
        fsm.from("jobs").select("id, number, party_id, service_type_id, completed_at").eq("business_id", businessId).eq("status", "completed"),
        "completed_at",
        range,
      )
        .order("completed_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
  );
  if (jobs.length === 0) return [];

  const [partyNames, serviceTypeNames, docs] = await Promise.all([
    partyNamesById(jobs.map((j) => j.party_id)),
    serviceTypeNamesById(jobs.map((j) => j.service_type_id)),
    listFsmInvoiceDocs(businessId, "id, total_amount, source_ref"),
  ]);
  const jobIds = new Set(jobs.map((j) => j.id));
  const invoicedByJobId = new Map<string, number>();
  for (const d of docs) {
    const jobId = jobIdOf(d.source_ref);
    if (jobId && jobIds.has(jobId)) invoicedByJobId.set(jobId, (invoicedByJobId.get(jobId) ?? 0) + Number(d.total_amount));
  }

  return jobs.map((j) => ({
    id: j.id,
    number: j.number,
    party_name: partyNames.get(j.party_id) ?? "Unknown customer",
    service_type_name: j.service_type_id ? serviceTypeNames.get(j.service_type_id) ?? null : null,
    completed_at: j.completed_at!,
    // The report's own figure: 0 for a completed job not invoiced yet.
    invoiced_amount: invoicedByJobId.get(j.id) ?? 0,
  }));
}

function sortedGroups(revenueByLabel: Map<string, number>): RevenueByGroupRow[] {
  return [...revenueByLabel.entries()].map(([label, revenue]) => ({ label, revenue })).sort((a, b) => b.revenue - a.revenue);
}

function addTo(map: Map<string, number>, label: string, amount: number) {
  map.set(label, (map.get(label) ?? 0) + amount);
}

export type RevenueReports = {
  byService: RevenueByGroupRow[];
  byTag: RevenueByGroupRow[];
  byChargeType: RevenueByGroupRow[];
  byMarketingSource: MarketingSourceRevenueRow[];
};

/** listRevenueByServiceReport, listRevenueByTagReport, listRevenueByChargeTypeReport and
 * listRevenueByMarketingSourceReport -- one read of the period's invoices shared by all
 * four, as listFsmInvoicesWithJobContext shares it between three of them. */
export async function listRevenueReportsForExport(businessId: string, range?: ReportDateRange): Promise<RevenueReports> {
  const docs = await listFsmInvoiceDocs(businessId, "id, total_amount, source_ref, doc_date", range);
  if (docs.length === 0) return { byService: [], byTag: [], byChargeType: [], byMarketingSource: [] };

  const fsm = await createFsmClient();
  const core = await coreClient();
  const jobIds = uniqueIds(docs.map((d) => jobIdOf(d.source_ref)));
  const [jobs, taggings, lines] = await Promise.all([
    selectIn<{ id: string; service_type_id: string | null; opportunity_id: string | null }>(fsm, "jobs", "id, service_type_id, opportunity_id", "id", jobIds),
    selectIn<{ id: string; tag_id: string; taggable_id: string }>(core, "taggings", "id, tag_id, taggable_id", "taggable_id", jobIds, {
      narrow: (q) => q.eq("business_id", businessId).eq("taggable_type", "job"),
    }),
    selectIn<{
      id: string;
      job_charge_type_id: string | null;
      quantity: number | string;
      unit_price: number | string;
      cgst_amount: number | string;
      sgst_amount: number | string;
      igst_amount: number | string;
    }>(core, "document_lines", "id, job_charge_type_id, quantity, unit_price, cgst_amount, sgst_amount, igst_amount", "document_id", docs.map((d) => d.id)),
  ]);
  const jobById = new Map(jobs.map((j) => [j.id, j]));

  const [serviceTypeNames, tags, chargeTypes, opportunities] = await Promise.all([
    serviceTypeNamesById(jobs.map((j) => j.service_type_id)),
    selectIn<NamedRow>(core, "tags", "id, name", "id", taggings.map((t) => t.tag_id)),
    selectIn<NamedRow>(fsm, "job_charge_types", "id, name", "id", lines.map((l) => l.job_charge_type_id)),
    selectIn<{ id: string; marketing_source_id: string | null }>(fsm, "opportunities", "id, marketing_source_id", "id", jobs.map((j) => j.opportunity_id)),
  ]);
  const tagNameById = new Map(tags.map((t) => [t.id, t.name]));
  const chargeTypeNameById = new Map(chargeTypes.map((c) => [c.id, c.name]));
  const sourceByOpportunityId = new Map(opportunities.map((o) => [o.id, o.marketing_source_id]));
  const tagIdsByJobId = new Map<string, string[]>();
  for (const t of taggings) tagIdsByJobId.set(t.taggable_id, [...(tagIdsByJobId.get(t.taggable_id) ?? []), t.tag_id]);

  const byService = new Map<string, number>();
  const byTag = new Map<string, number>();
  const byMarketingSource = new Map<string, number>();
  for (const d of docs) {
    const amount = Number(d.total_amount);
    const jobId = jobIdOf(d.source_ref);
    const job = jobId ? jobById.get(jobId) : undefined;

    const serviceTypeId = job?.service_type_id;
    addTo(byService, serviceTypeId ? serviceTypeNames.get(serviceTypeId) ?? "Unspecified" : "Unspecified", amount);

    const jobTagIds = jobId ? tagIdsByJobId.get(jobId) ?? [] : [];
    const tagLabels = jobTagIds.length ? jobTagIds.map((id) => tagNameById.get(id) ?? "Unknown tag") : ["Untagged"];
    for (const label of tagLabels) addTo(byTag, label, amount);

    const opportunityId = job?.opportunity_id;
    const sourceId = opportunityId ? sourceByOpportunityId.get(opportunityId) : undefined;
    addTo(byMarketingSource, sourceId ?? "Unattributed", amount);
  }

  const byChargeType = new Map<string, number>();
  for (const l of lines) {
    const label = l.job_charge_type_id ? chargeTypeNameById.get(l.job_charge_type_id) ?? "Unspecified" : "Unspecified";
    const amount = Number(l.quantity) * Number(l.unit_price) + Number(l.cgst_amount) + Number(l.sgst_amount) + Number(l.igst_amount);
    addTo(byChargeType, label, amount);
  }

  return {
    byService: sortedGroups(byService),
    byTag: sortedGroups(byTag),
    byChargeType: sortedGroups(byChargeType),
    byMarketingSource: sortedGroups(byMarketingSource),
  };
}

/** The aging bucket for `daysOverdue` -- reports/queries.ts#listAccountAgingReport's
 * boundaries. */
export function agingBucket(daysOverdue: number): AgingRow["aging_bucket"] {
  return daysOverdue <= 0 ? "current" : daysOverdue <= 30 ? "1-30" : daysOverdue <= 60 ? "31-60" : daysOverdue <= 90 ? "61-90" : "90+";
}

/** listCustomerBalancesReport and listAccountAgingReport -- current-state snapshots of
 * the same invoices' balances, so read once. */
export async function listBalanceReportsForExport(businessId: string): Promise<{ customerBalances: CustomerBalanceRow[]; aging: AgingRow[] }> {
  const docs = await listFsmInvoiceDocs(businessId, "id, party_id, number, due_date, doc_date, source_ref");
  if (docs.length === 0) return { customerBalances: [], aging: [] };

  const balances = await balancesByDocumentId(docs.map((d) => d.id));
  const outstanding = docs.map((d) => ({ doc: d, balance: balances.get(d.id) ?? 0 })).filter((x) => x.balance > 0);
  if (outstanding.length === 0) return { customerBalances: [], aging: [] };
  const partyNames = await partyNamesById(outstanding.map((x) => x.doc.party_id));

  const balanceByPartyId = new Map<string, number>();
  for (const { doc, balance } of outstanding) balanceByPartyId.set(doc.party_id, (balanceByPartyId.get(doc.party_id) ?? 0) + balance);
  const customerBalances = [...balanceByPartyId.entries()]
    .map(([party_id, balance_amount]) => ({ party_id, party_name: partyNames.get(party_id) ?? "Unknown customer", balance_amount }))
    .sort((a, b) => b.balance_amount - a.balance_amount);

  const today = new Date();
  const aging = outstanding
    .map(({ doc, balance }) => {
      const dueDate = (doc.due_date as string | null) ?? (doc.doc_date as string);
      const daysOverdue = Math.floor((today.getTime() - new Date(dueDate).getTime()) / (24 * 60 * 60 * 1000));
      return {
        document_id: doc.id,
        party_name: partyNames.get(doc.party_id) ?? "Unknown customer",
        number: doc.number as string | null,
        due_date: dueDate,
        days_overdue: daysOverdue,
        balance_amount: balance,
        aging_bucket: agingBucket(daysOverdue),
      };
    })
    .sort((a, b) => b.days_overdue - a.days_overdue);

  return { customerBalances, aging };
}

/** listPaymentsReport, every row: payments with an allocation against any fsm-sourced
 * document, in the period, newest first. */
export async function listPaymentsForExport(businessId: string, range?: ReportDateRange): Promise<PaymentRow[]> {
  const core = await coreClient();
  const fsmDocs = await fetchAllRows<{ id: string }>((from, to) =>
    core.from("documents").select("id").eq("business_id", businessId).eq("source_module", "fsm").order("id", { ascending: true }).range(from, to),
  );
  if (fsmDocs.length === 0) return [];

  const allocations = await selectIn<{ id: string; payment_id: string; document_id: string }>(
    core,
    "payment_allocations",
    "id, payment_id, document_id",
    "document_id",
    fsmDocs.map((d) => d.id),
  );
  const paymentIds = uniqueIds(allocations.map((a) => a.payment_id));
  if (paymentIds.length === 0) return [];
  const documentIdByPaymentId = new Map<string, string>();
  for (const a of allocations) if (!documentIdByPaymentId.has(a.payment_id)) documentIdByPaymentId.set(a.payment_id, a.document_id);

  const payments = await selectIn<{ id: string; party_id: string; method: PaymentMethod; amount: number | string; payment_date: string; reference: string | null }>(
    core,
    "payments",
    "id, party_id, method, amount, payment_date, reference",
    "id",
    paymentIds,
    { narrow: (q) => withDateRange(q, "payment_date", range) },
  );
  payments.sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.id.localeCompare(a.id));
  const partyNames = await partyNamesById(payments.map((p) => p.party_id));

  return payments.map((p) => ({
    id: p.id,
    party_name: partyNames.get(p.party_id) ?? "Unknown customer",
    method: p.method,
    amount: Number(p.amount),
    payment_date: p.payment_date,
    reference: p.reference,
    document_id: documentIdByPaymentId.get(p.id) ?? null,
  }));
}

/** listTimecardsReport and listProductivityReport -- the same period's time entries. */
export async function listTimeReportsForExport(
  businessId: string,
  range?: ReportDateRange,
): Promise<{ timecards: TimecardRow[]; productivity: ProductivityRow[] }> {
  const fsm = await createFsmClient();
  const effectiveRange = range ?? defaultToCurrentMonth();
  const entries = await fetchAllRows<{ id: string; employee_id: string; job_id: string; duration_minutes: number | string | null; is_billable: boolean }>(
    (from, to) =>
      withTimestampRange(
        fsm
          .from("time_entries")
          .select("id, employee_id, job_id, duration_minutes, is_billable")
          .eq("business_id", businessId)
          .not("duration_minutes", "is", null),
        "started_at",
        effectiveRange,
      )
        .order("id", { ascending: true })
        .range(from, to),
  );
  if (entries.length === 0) return { timecards: [], productivity: [] };

  const [jobs, profiles] = await Promise.all([
    selectIn<{ id: string; status: JobStatus }>(fsm, "jobs", "id, status", "id", entries.map((e) => e.job_id)),
    profilesByEmployeeId(uniqueIds(entries.map((e) => e.employee_id))),
  ]);
  const completedJobIds = new Set(jobs.filter((j) => j.status === "completed").map((j) => j.id));
  // The reports' own naming: full name, else "Unknown".
  const nameOf = (employeeId: string) => profiles.get(employeeId)?.full_name ?? "Unknown";
  const hours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

  const byEmployee = new Map<string, { totalMinutes: number; billableMinutes: number; count: number; completedJobIds: Set<string> }>();
  for (const e of entries) {
    const acc = byEmployee.get(e.employee_id) ?? { totalMinutes: 0, billableMinutes: 0, count: 0, completedJobIds: new Set<string>() };
    const minutes = Number(e.duration_minutes ?? 0);
    acc.totalMinutes += minutes;
    if (e.is_billable) acc.billableMinutes += minutes;
    acc.count += 1;
    if (completedJobIds.has(e.job_id)) acc.completedJobIds.add(e.job_id);
    byEmployee.set(e.employee_id, acc);
  }

  const timecards = [...byEmployee.entries()]
    .map(([employeeId, acc]) => ({
      employee_name: nameOf(employeeId),
      total_hours: hours(acc.totalMinutes),
      billable_hours: hours(acc.billableMinutes),
      entry_count: acc.count,
    }))
    .sort((a, b) => b.total_hours - a.total_hours);
  const productivity = [...byEmployee.entries()]
    .map(([employeeId, acc]) => ({ employee_name: nameOf(employeeId), jobs_completed: acc.completedJobIds.size, total_hours: hours(acc.totalMinutes) }))
    .sort((a, b) => b.jobs_completed - a.jobs_completed);

  return { timecards, productivity };
}
