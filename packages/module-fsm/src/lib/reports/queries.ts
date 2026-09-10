import { cache } from "react";
import { createClient as createFsmClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { getDocumentBalance } from "@cofounderai/core/payments/queries";
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
} from "./types";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

// Untyped like every other `.from(table)` caller against these schemas (Database = any) --
// lets a partially-built query be filtered further before being awaited.
type QueryBuilder = any;

/** For `date`-typed columns (`doc_date`, `payment_date`, `due_date`) -- `range.from`/`to`
 * are already plain calendar dates, so a direct compare is correct. */
function withDateRange(query: QueryBuilder, column: string, range?: ReportDateRange): QueryBuilder {
  let q = query;
  if (range?.from) q = q.gte(column, range.from);
  if (range?.to) q = q.lte(column, range.to);
  return q;
}

/** For `timestamptz`-typed columns (`completed_at`, `started_at`) -- a plain calendar
 * date on the upper bound would cut off at that day's midnight, excluding the rest of the
 * day, so `to` is pushed to the end of that day. */
function withTimestampRange(query: QueryBuilder, column: string, range?: ReportDateRange): QueryBuilder {
  let q = query;
  if (range?.from) q = q.gte(column, `${range.from}T00:00:00.000Z`);
  if (range?.to) q = q.lte(column, `${range.to}T23:59:59.999Z`);
  return q;
}

function defaultToCurrentMonth(): ReportDateRange {
  const monthStart = new Date();
  monthStart.setDate(1);
  return { from: monthStart.toISOString().slice(0, 10) };
}

/** Every fsm-issued invoice for this business, its own job (when it has one), and that
 * job's `service_type_id`/`opportunity_id` -- the one join every revenue-by-X report
 * below needs, fetched once rather than five times. Same "no PostgREST embed, join in
 * JS" pattern as every other list query in this module. */
async function listFsmInvoicesWithJobContext(businessId: string, range?: ReportDateRange) {
  const core = await coreClient();
  const { data: docs, error } = await withDateRange(
    core.from("documents").select("id, total_amount, source_ref, doc_date").eq("business_id", businessId).eq("doc_type", "invoice").eq("source_module", "fsm"),
    "doc_date",
    range,
  );
  if (error) throw error;
  if (docs.length === 0) return { docs: [] as typeof docs, jobById: new Map() };

  const jobIds = [
    ...new Set(docs.map((d: { source_ref: unknown }) => (d.source_ref as { job_id?: string })?.job_id).filter((id: string | undefined): id is string => Boolean(id))),
  ];
  const fsm = await createFsmClient();
  const { data: jobs, error: jobsError } = jobIds.length
    ? await fsm.from("jobs").select("id, service_type_id, opportunity_id").in("id", jobIds)
    : { data: [] as { id: string; service_type_id: string | null; opportunity_id: string | null }[], error: null };
  if (jobsError) throw jobsError;

  return { docs, jobById: new Map(jobs.map((j: { id: string }) => [j.id, j])) };
}

/** "Jobs completed" (PRD §2 Reports row MUST) -- every completed job, alongside its own
 * invoiced amount when one exists (0 for a completed job with no invoice yet). */
interface RawCompletedJob {
  id: string;
  number: string | null;
  party_id: string;
  service_type_id: string | null;
  completed_at: string | null;
}

export const listJobsCompletedReport = cache(async (businessId: string, range?: ReportDateRange): Promise<JobsCompletedRow[]> => {
  const fsm = await createFsmClient();
  const { data, error } = await withTimestampRange(
    fsm.from("jobs").select("id, number, party_id, service_type_id, completed_at").eq("business_id", businessId).eq("status", "completed"),
    "completed_at",
    range,
  ).order("completed_at", { ascending: false });
  if (error) throw error;
  const jobs = data as RawCompletedJob[];
  if (jobs.length === 0) return [];

  const core = await coreClient();
  const partyIds = [...new Set(jobs.map((j) => j.party_id))];
  const serviceTypeIds = [...new Set(jobs.map((j) => j.service_type_id).filter((id): id is string => Boolean(id)))];
  const jobIds = jobs.map((j) => j.id);

  const [partiesRes, serviceTypesRes, docsRes] = await Promise.all([
    core.from("parties").select("id, name").in("id", partyIds),
    serviceTypeIds.length ? fsm.from("service_types").select("id, name").in("id", serviceTypeIds) : Promise.resolve({ data: [], error: null }),
    core.from("documents").select("total_amount, source_ref").eq("business_id", businessId).eq("doc_type", "invoice").eq("source_module", "fsm"),
  ]);
  if (partiesRes.error) throw partiesRes.error;
  if (serviceTypesRes.error) throw serviceTypesRes.error;
  if (docsRes.error) throw docsRes.error;

  const partyNameById = new Map(partiesRes.data.map((p) => [p.id, p.name]));
  const serviceTypeNameById = new Map(serviceTypesRes.data.map((s) => [s.id, s.name]));
  const invoicedByJobId = new Map<string, number>();
  for (const d of docsRes.data) {
    const jobId = (d.source_ref as { job_id?: string })?.job_id;
    if (jobId && jobIds.includes(jobId)) invoicedByJobId.set(jobId, (invoicedByJobId.get(jobId) ?? 0) + Number(d.total_amount));
  }

  return jobs.map((j) => ({
    id: j.id,
    number: j.number,
    party_name: partyNameById.get(j.party_id) ?? "Unknown customer",
    service_type_name: j.service_type_id ? serviceTypeNameById.get(j.service_type_id) ?? null : null,
    completed_at: j.completed_at!,
    invoiced_amount: invoicedByJobId.get(j.id) ?? 0,
  }));
});

export const listRevenueByServiceReport = cache(async (businessId: string, range?: ReportDateRange): Promise<RevenueByGroupRow[]> => {
  const { docs, jobById } = await listFsmInvoicesWithJobContext(businessId, range);
  if (docs.length === 0) return [];

  const fsm = await createFsmClient();
  const serviceTypeIds = [...new Set([...jobById.values()].map((j) => j.service_type_id).filter((id): id is string => Boolean(id)))];
  const { data: serviceTypes, error } = serviceTypeIds.length
    ? await fsm.from("service_types").select("id, name").in("id", serviceTypeIds)
    : { data: [], error: null };
  if (error) throw error;
  const nameById = new Map(serviceTypes.map((s) => [s.id, s.name]));

  const revenueByLabel = new Map<string, number>();
  for (const d of docs) {
    const jobId = (d.source_ref as { job_id?: string })?.job_id;
    const serviceTypeId = jobId ? jobById.get(jobId)?.service_type_id : undefined;
    const label = serviceTypeId ? nameById.get(serviceTypeId) ?? "Unspecified" : "Unspecified";
    revenueByLabel.set(label, (revenueByLabel.get(label) ?? 0) + Number(d.total_amount));
  }
  return [...revenueByLabel.entries()].map(([label, revenue]) => ({ label, revenue })).sort((a, b) => b.revenue - a.revenue);
});

/** Revenue-by-tag counts a multi-tagged job's full invoice amount toward every one of its
 * tags (Kickserv's own "revenue by tag" reporting semantics -- a job tagged both
 * "Emergency" and "Repeat customer" contributes to both totals, not a split). */
export const listRevenueByTagReport = cache(async (businessId: string, range?: ReportDateRange): Promise<RevenueByGroupRow[]> => {
  const { docs, jobById } = await listFsmInvoicesWithJobContext(businessId, range);
  if (docs.length === 0) return [];

  const core = await coreClient();
  const jobIds = [...jobById.keys()];
  const { data: taggings, error } = jobIds.length
    ? await core.from("taggings").select("tag_id, taggable_id").eq("business_id", businessId).eq("taggable_type", "job").in("taggable_id", jobIds)
    : { data: [], error: null };
  if (error) throw error;

  const tagIds = [...new Set(taggings.map((t) => t.tag_id))];
  const { data: tags, error: tagsError } = tagIds.length ? await core.from("tags").select("id, name").in("id", tagIds) : { data: [], error: null };
  if (tagsError) throw tagsError;
  const tagNameById = new Map(tags.map((t) => [t.id, t.name]));

  const tagIdsByJobId = new Map<string, string[]>();
  for (const t of taggings) {
    const list = tagIdsByJobId.get(t.taggable_id) ?? [];
    list.push(t.tag_id);
    tagIdsByJobId.set(t.taggable_id, list);
  }

  const revenueByLabel = new Map<string, number>();
  for (const d of docs) {
    const jobId = (d.source_ref as { job_id?: string })?.job_id;
    const jobTagIds = jobId ? tagIdsByJobId.get(jobId) ?? [] : [];
    const labels = jobTagIds.length ? jobTagIds.map((id) => tagNameById.get(id) ?? "Unknown tag") : ["Untagged"];
    for (const label of labels) revenueByLabel.set(label, (revenueByLabel.get(label) ?? 0) + Number(d.total_amount));
  }
  return [...revenueByLabel.entries()].map(([label, revenue]) => ({ label, revenue })).sort((a, b) => b.revenue - a.revenue);
});

export const listRevenueByChargeTypeReport = cache(async (businessId: string, range?: ReportDateRange): Promise<RevenueByGroupRow[]> => {
  const core = await coreClient();
  const { data: docs, error: docsError } = await withDateRange(
    core.from("documents").select("id").eq("business_id", businessId).eq("doc_type", "invoice").eq("source_module", "fsm"),
    "doc_date",
    range,
  );
  if (docsError) throw docsError;
  if (docs.length === 0) return [];

  const { data: lines, error: linesError } = await core
    .from("document_lines")
    .select("job_charge_type_id, quantity, unit_price, cgst_amount, sgst_amount, igst_amount")
    .in("document_id", docs.map((d: { id: string }) => d.id));
  if (linesError) throw linesError;

  const fsm = await createFsmClient();
  const chargeTypeIds = [...new Set(lines.map((l) => l.job_charge_type_id).filter((id): id is string => Boolean(id)))];
  const { data: chargeTypes, error: chargeTypesError } = chargeTypeIds.length
    ? await fsm.from("job_charge_types").select("id, name").in("id", chargeTypeIds)
    : { data: [], error: null };
  if (chargeTypesError) throw chargeTypesError;
  const nameById = new Map(chargeTypes.map((c) => [c.id, c.name]));

  const revenueByLabel = new Map<string, number>();
  for (const l of lines) {
    const label = l.job_charge_type_id ? nameById.get(l.job_charge_type_id) ?? "Unspecified" : "Unspecified";
    const amount = Number(l.quantity) * Number(l.unit_price) + Number(l.cgst_amount) + Number(l.sgst_amount) + Number(l.igst_amount);
    revenueByLabel.set(label, (revenueByLabel.get(label) ?? 0) + amount);
  }
  return [...revenueByLabel.entries()].map(([label, revenue]) => ({ label, revenue })).sort((a, b) => b.revenue - a.revenue);
});

/** "Marketing sources (joined to discovery when licensed)" (PRD §2 Reports row MUST) --
 * groups by `fsm.opportunities.marketing_source_id`, a bare/no-FK column nothing in this
 * platform sets yet (F-13, the discovery handoff, is the story that will start
 * populating it on `prospect.won`). Everything buckets to "Unattributed" until then --
 * that's the correct degraded-mode result (ADR-10), not a bug: the report is fully wired
 * and will start reflecting real attribution the moment F-13 ships, no changes needed
 * here. No `module-discovery` import either way -- there's no contract function to
 * resolve a marketing source id to a name yet, so a raw id (if one ever appears) shows
 * as-is rather than guessing a display name. */
export const listRevenueByMarketingSourceReport = cache(async (businessId: string, range?: ReportDateRange): Promise<MarketingSourceRevenueRow[]> => {
  const { docs, jobById } = await listFsmInvoicesWithJobContext(businessId, range);
  if (docs.length === 0) return [];

  const fsm = await createFsmClient();
  const opportunityIds = [...new Set([...jobById.values()].map((j) => j.opportunity_id).filter((id): id is string => Boolean(id)))];
  const { data: opportunities, error } = opportunityIds.length
    ? await fsm.from("opportunities").select("id, marketing_source_id").in("id", opportunityIds)
    : { data: [], error: null };
  if (error) throw error;
  const sourceByOpportunityId = new Map(opportunities.map((o) => [o.id, o.marketing_source_id]));

  const revenueByLabel = new Map<string, number>();
  for (const d of docs) {
    const jobId = (d.source_ref as { job_id?: string })?.job_id;
    const opportunityId = jobId ? jobById.get(jobId)?.opportunity_id : undefined;
    const sourceId = opportunityId ? sourceByOpportunityId.get(opportunityId) : undefined;
    const label = sourceId ?? "Unattributed";
    revenueByLabel.set(label, (revenueByLabel.get(label) ?? 0) + Number(d.total_amount));
  }
  return [...revenueByLabel.entries()].map(([label, revenue]) => ({ label, revenue })).sort((a, b) => b.revenue - a.revenue);
});

export const listCustomerBalancesReport = cache(async (businessId: string): Promise<CustomerBalanceRow[]> => {
  const core = await coreClient();
  const { data: docs, error } = await core
    .from("documents")
    .select("id, party_id")
    .eq("business_id", businessId)
    .eq("doc_type", "invoice")
    .eq("source_module", "fsm");
  if (error) throw error;
  if (docs.length === 0) return [];

  const balances = await Promise.all(docs.map((d) => getDocumentBalance(d.id)));
  const balanceByPartyId = new Map<string, number>();
  for (let i = 0; i < docs.length; i++) {
    const balance = balances[i]?.balance_amount ?? 0;
    if (balance <= 0) continue;
    const partyId = docs[i]!.party_id;
    balanceByPartyId.set(partyId, (balanceByPartyId.get(partyId) ?? 0) + balance);
  }
  if (balanceByPartyId.size === 0) return [];

  const { data: parties, error: partiesError } = await core.from("parties").select("id, name").in("id", [...balanceByPartyId.keys()]);
  if (partiesError) throw partiesError;
  const nameById = new Map(parties.map((p) => [p.id, p.name]));

  return [...balanceByPartyId.entries()]
    .map(([party_id, balance_amount]) => ({ party_id, party_name: nameById.get(party_id) ?? "Unknown customer", balance_amount }))
    .sort((a, b) => b.balance_amount - a.balance_amount);
});

/** Account aging, scoped to fsm's own invoices -- `core.document_aging` (D-7) is
 * business-wide across every module, so this re-derives the same bucket boundaries
 * (1-30/31-60/61-90/90+ past `due_date`, falling back to `doc_date`) directly rather than
 * filtering that view, which carries no `source_module` column to filter by. */
export const listAccountAgingReport = cache(async (businessId: string): Promise<AgingRow[]> => {
  const core = await coreClient();
  const { data: docs, error } = await core
    .from("documents")
    .select("id, party_id, number, due_date, doc_date")
    .eq("business_id", businessId)
    .eq("doc_type", "invoice")
    .eq("source_module", "fsm");
  if (error) throw error;
  if (docs.length === 0) return [];

  const balances = await Promise.all(docs.map((d) => getDocumentBalance(d.id)));
  const overdue = docs
    .map((d, i) => ({ doc: d, balance: balances[i]?.balance_amount ?? 0 }))
    .filter((x) => x.balance > 0);
  if (overdue.length === 0) return [];

  const partyIds = [...new Set(overdue.map((x) => x.doc.party_id))];
  const { data: parties, error: partiesError } = await core.from("parties").select("id, name").in("id", partyIds);
  if (partiesError) throw partiesError;
  const nameById = new Map(parties.map((p) => [p.id, p.name]));

  const today = new Date();
  return overdue
    .map(({ doc, balance }) => {
      const dueDate = doc.due_date ?? doc.doc_date;
      const daysOverdue = Math.floor((today.getTime() - new Date(dueDate).getTime()) / (24 * 60 * 60 * 1000));
      const bucket: AgingRow["aging_bucket"] = daysOverdue <= 0 ? "current" : daysOverdue <= 30 ? "1-30" : daysOverdue <= 60 ? "31-60" : daysOverdue <= 90 ? "61-90" : "90+";
      return {
        document_id: doc.id,
        party_name: nameById.get(doc.party_id) ?? "Unknown customer",
        number: doc.number,
        due_date: dueDate,
        days_overdue: daysOverdue,
        balance_amount: balance,
        aging_bucket: bucket,
      };
    })
    .sort((a, b) => b.days_overdue - a.days_overdue);
});

/** "Payments by date" (PRD §2 Reports row MUST) -- `core.payments` is shared across
 * modules (D-7), so this scopes to payments with at least one allocation against an
 * fsm-sourced document, not every payment this business has ever recorded. */
export const listPaymentsReport = cache(async (businessId: string, range?: ReportDateRange): Promise<PaymentRow[]> => {
  const core = await coreClient();
  const { data: fsmDocs, error: docsError } = await core.from("documents").select("id").eq("business_id", businessId).eq("source_module", "fsm");
  if (docsError) throw docsError;
  if (fsmDocs.length === 0) return [];

  const { data: allocations, error: allocError } = await core
    .from("payment_allocations")
    .select("payment_id, document_id")
    .in("document_id", fsmDocs.map((d) => d.id));
  if (allocError) throw allocError;
  const paymentIds = [...new Set(allocations.map((a) => a.payment_id))];
  if (paymentIds.length === 0) return [];
  // First allocation wins when a payment is split across more than one fsm invoice --
  // good enough for a "jump to the invoice" link, not meant to represent a split payment.
  const documentIdByPaymentId = new Map<string, string>();
  for (const a of allocations) {
    if (!documentIdByPaymentId.has(a.payment_id)) documentIdByPaymentId.set(a.payment_id, a.document_id);
  }

  interface RawPayment {
    id: string;
    party_id: string;
    method: string;
    amount: number;
    payment_date: string;
    reference: string | null;
  }
  const { data, error: paymentsError } = await withDateRange(
    core.from("payments").select("id, party_id, method, amount, payment_date, reference").in("id", paymentIds),
    "payment_date",
    range,
  ).order("payment_date", { ascending: false });
  if (paymentsError) throw paymentsError;
  const payments = data as RawPayment[];

  const partyIds = [...new Set(payments.map((p) => p.party_id))];
  const { data: parties, error: partiesError } = await core.from("parties").select("id, name").in("id", partyIds);
  if (partiesError) throw partiesError;
  const nameById = new Map(parties.map((p) => [p.id, p.name]));

  return payments.map((p) => ({
    id: p.id,
    party_name: nameById.get(p.party_id) ?? "Unknown customer",
    method: p.method,
    amount: Number(p.amount),
    payment_date: p.payment_date,
    reference: p.reference,
    document_id: documentIdByPaymentId.get(p.id) ?? null,
  }));
});

/** "Timecards by pay period" (PRD §2 Reports row MUST) -- no pay-period configuration
 * exists anywhere in this platform yet (that's a payroll concept F-15/settings never
 * introduced either), so this defaults to the current calendar month per employee when no
 * range is given, and otherwise honors the report page's own date-range control -- a
 * documented simplification rather than a fabricated pay-period setting. */
export const listTimecardsReport = cache(async (businessId: string, range?: ReportDateRange): Promise<TimecardRow[]> => {
  const fsm = await createFsmClient();
  const effectiveRange = range ?? defaultToCurrentMonth();

  const { data, error } = await withTimestampRange(
    fsm.from("time_entries").select("employee_id, duration_minutes, is_billable").eq("business_id", businessId).not("duration_minutes", "is", null),
    "started_at",
    effectiveRange,
  );
  if (error) throw error;
  const entries = data as { employee_id: string; duration_minutes: number | null; is_billable: boolean }[];
  if (entries.length === 0) return [];

  const core = await coreClient();
  const employeeIds = [...new Set(entries.map((e) => e.employee_id))];
  const { data: employees, error: employeesError } = await core.from("employees").select("id, user_id").in("id", employeeIds);
  if (employeesError) throw employeesError;
  const userIds = employees.map((e) => e.user_id).filter((id): id is string => Boolean(id));
  const { data: profiles, error: profilesError } = userIds.length
    ? await core.from("user_profiles").select("id, full_name").in("id", userIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;
  const profileByUserId = new Map(profiles.map((p) => [p.id, p]));
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  const byEmployee = new Map<string, { totalMinutes: number; billableMinutes: number; count: number }>();
  for (const e of entries) {
    const acc = byEmployee.get(e.employee_id) ?? { totalMinutes: 0, billableMinutes: 0, count: 0 };
    acc.totalMinutes += e.duration_minutes ?? 0;
    if (e.is_billable) acc.billableMinutes += e.duration_minutes ?? 0;
    acc.count += 1;
    byEmployee.set(e.employee_id, acc);
  }

  return [...byEmployee.entries()]
    .map(([employeeId, acc]) => {
      const employee = employeeById.get(employeeId);
      const name = employee?.user_id ? profileByUserId.get(employee.user_id)?.full_name ?? "Unknown" : "Unknown";
      return { employee_name: name, total_hours: Math.round((acc.totalMinutes / 60) * 100) / 100, billable_hours: Math.round((acc.billableMinutes / 60) * 100) / 100, entry_count: acc.count };
    })
    .sort((a, b) => b.total_hours - a.total_hours);
});

/** "Productivity per employee" (PRD §2 Reports row MUST) -- jobs completed and hours
 * logged over the same period `listTimecardsReport` uses (current calendar month by
 * default, or the report page's own date-range selection), for consistency between the
 * two employee-facing reports. */
export const listProductivityReport = cache(async (businessId: string, range?: ReportDateRange): Promise<ProductivityRow[]> => {
  const fsm = await createFsmClient();
  const effectiveRange = range ?? defaultToCurrentMonth();

  const { data, error } = await withTimestampRange(
    fsm.from("time_entries").select("employee_id, job_id, duration_minutes").eq("business_id", businessId).not("duration_minutes", "is", null),
    "started_at",
    effectiveRange,
  );
  if (error) throw error;
  const entries = data as { employee_id: string; job_id: string; duration_minutes: number | null }[];
  if (entries.length === 0) return [];

  const jobIds = [...new Set(entries.map((e) => e.job_id))];
  const { data: jobs, error: jobsError } = await fsm.from("jobs").select("id, status").in("id", jobIds);
  if (jobsError) throw jobsError;
  const completedJobIds = new Set(jobs.filter((j) => j.status === "completed").map((j) => j.id));

  const core = await coreClient();
  const employeeIds = [...new Set(entries.map((e) => e.employee_id))];
  const { data: employees, error: employeesError } = await core.from("employees").select("id, user_id").in("id", employeeIds);
  if (employeesError) throw employeesError;
  const userIds = employees.map((e) => e.user_id).filter((id): id is string => Boolean(id));
  const { data: profiles, error: profilesError } = userIds.length
    ? await core.from("user_profiles").select("id, full_name").in("id", userIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;
  const profileByUserId = new Map(profiles.map((p) => [p.id, p]));
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  const byEmployee = new Map<string, { minutes: number; completedJobIds: Set<string> }>();
  for (const e of entries) {
    const acc = byEmployee.get(e.employee_id) ?? { minutes: 0, completedJobIds: new Set<string>() };
    acc.minutes += e.duration_minutes ?? 0;
    if (completedJobIds.has(e.job_id)) acc.completedJobIds.add(e.job_id);
    byEmployee.set(e.employee_id, acc);
  }

  return [...byEmployee.entries()]
    .map(([employeeId, acc]) => {
      const employee = employeeById.get(employeeId);
      const name = employee?.user_id ? profileByUserId.get(employee.user_id)?.full_name ?? "Unknown" : "Unknown";
      return { employee_name: name, jobs_completed: acc.completedJobIds.size, total_hours: Math.round((acc.minutes / 60) * 100) / 100 };
    })
    .sort((a, b) => b.jobs_completed - a.jobs_completed);
});
