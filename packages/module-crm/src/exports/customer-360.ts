// EXP-CRM-10 (Customer 360) -- one customer's CRM record, its cross-module history and
// payment aging, one sheet per section of /crm/customers/[partyId].
import { ExportDeniedError, type ExportAdapter } from "@cofounderai/core/exports/server";
import type { ExportSheet } from "@cofounderai/core/exports/types";
import { getParty, listContactsForParty } from "@cofounderai/core/parties/queries";
import type { PartyContact } from "@cofounderai/core/parties/types";
import { listAgingForParty } from "@cofounderai/core/payments/queries";
import type { DocumentAging } from "@cofounderai/core/payments/types";
import { listRecentJobsForParty } from "@cofounderai/module-fsm/contract/index";
import type { ContractJobSummary } from "@cofounderai/module-fsm/contract/types";
import { listRecentOrdersForParty } from "@cofounderai/module-inventory/contract/index";
import type { ContractOrderSummary } from "@cofounderai/module-inventory/contract/types";
import { getCustomer360 } from "../lib/customer-360/queries";
import type { Customer360OpportunitySummary, Customer360ProductInterest } from "../lib/customer-360/types";
import type { FollowUp } from "../lib/follow-ups/types";
import { listStages } from "../lib/opportunities/queries";
import { getBuyingIntentScore, type BuyingIntentSignal } from "../lib/scoring/buying-intent";
import { listEmployeeOptions } from "../lib/tickets/queries";
import { listRelationshipTimeline } from "../lib/timeline/queries";
import type { TimelineEntry, TimelineSource } from "../lib/timeline/types";
import { SOURCE_CHANNEL_LABEL, employeeMap, humanize, labelOf, ownerName } from "./labels";

const TIMELINE_SOURCE_LABEL: Record<TimelineSource, string> = {
  "crm.activity": "CRM activity",
  "crm.interaction": "CRM interaction",
  "crm.opportunity": "CRM opportunity",
  "inventory.order": "Inventory order",
  "inventory.product_interest": "Inventory product interest",
  "fsm.job": "FSM job",
  "fsm.quote": "FSM quote",
  "fsm.assessment": "FSM assessment",
  "discovery.prospect": "Discovery prospect",
};

/** A cross-module read as the export reports it: the rows, or blank plus why (§45). */
type Sourced<T> = { rows: T[]; available: boolean; source: string };

function sourced<T>(module: string, result: { ok: true; data: T[] } | { ok: false; error: string }): Sourced<T> {
  if (result.ok) return { rows: result.data, available: true, source: module };
  return {
    rows: [],
    available: false,
    source: result.error === "MODULE_NOT_LICENSED" ? `${module} unavailable (not licensed)` : `${module} unavailable`,
  };
}

type Filters = { partyId: string };

type CustomerRow = {
  name: string;
  kind: string;
  email: string | null;
  phone: string | null;
  lifecycleStatus: string;
  source: string;
  owner: string;
  score: number | null;
  scoreCalculatedAt: string | null;
  outstanding: number | null;
  orders: Sourced<ContractOrderSummary>;
  jobs: Sourced<ContractJobSummary>;
};

/**
 * The customer is the page's own route segment (`partyId`), handed to the Export button
 * as its only param and re-checked here: a party that isn't this business's is refused
 * as not found, exactly as the page 404s. Recent orders and jobs come only through the
 * Inventory and FSM contracts; `MODULE_NOT_LICENSED` leaves those sheets empty and the
 * Customer sheet's count blank, with a "… source" column saying why. The buying intent
 * score is the stored, rule-based score (never recalculated by an export) and is
 * labelled as such. Notes and the AI summary are not part of the export.
 */
export const crmCustomer360Export: ExportAdapter<Filters> = {
  id: "crm.customer-360",
  module: "crm",
  permissions: ["crm.view"],
  parseFilters: (params) => ({ partyId: params.get("partyId") ?? "" }),
  async load(context, filters) {
    const businessId = context.businessId;
    if (!filters.partyId) throw new ExportDeniedError("Choose a customer to export.", 404);
    const party = await getParty(filters.partyId);
    if (!party || party.business_id !== businessId) throw new ExportDeniedError("Customer not found.", 404);
    const partyId = party.id;

    const [customer, contacts, aging, timeline, score, stages, employees, ordersResult, jobsResult] = await Promise.all([
      getCustomer360(businessId, partyId),
      party.kind === "company" ? listContactsForParty(partyId) : Promise.resolve([] as PartyContact[]),
      listAgingForParty(businessId, partyId),
      listRelationshipTimeline(businessId, partyId),
      getBuyingIntentScore(businessId, partyId),
      listStages(businessId),
      listEmployeeOptions(businessId),
      listRecentOrdersForParty(businessId, partyId),
      listRecentJobsForParty(businessId, partyId),
    ]);
    const orders = sourced("Inventory", ordersResult);
    const jobs = sourced("FSM", jobsResult);
    const employeeById = employeeMap(employees);
    const stageNameById = new Map(stages.map((s) => [s.id, s.name]));

    const summary: CustomerRow = {
      name: party.name,
      kind: humanize(party.kind),
      email: party.email,
      phone: party.phone,
      lifecycleStatus: humanize(customer.lifecycleStatus),
      source: labelOf(SOURCE_CHANNEL_LABEL, customer.source),
      owner: customer.lifecycleStatus ? ownerName(employeeById, customer.ownerId) : "",
      score: score?.score ?? null,
      scoreCalculatedAt: score?.calculatedAt ?? null,
      outstanding: aging.length > 0 ? aging.reduce((sum, row) => sum + Number(row.balance_amount), 0) : null,
      orders,
      jobs,
    };

    const customerSheet: ExportSheet<CustomerRow> = {
      sheetName: "Customer",
      columns: [
        { key: "name", header: "Customer", getValue: (r) => r.name },
        { key: "kind", header: "Type", getValue: (r) => r.kind },
        { key: "email", header: "Email", getValue: (r) => r.email ?? "" },
        { key: "phone", header: "Phone", getValue: (r) => r.phone ?? "" },
        { key: "lifecycle", header: "Lifecycle status", getValue: (r) => r.lifecycleStatus },
        { key: "source", header: "Source", getValue: (r) => r.source },
        { key: "owner", header: "Owner", getValue: (r) => r.owner },
        { key: "score", header: "Buying intent score", type: "integer", getValue: (r) => r.score },
        { key: "score_source", header: "Buying intent source", getValue: (r) => (r.score === null ? "Not calculated yet" : "Rule-based score") },
        { key: "score_calculated", header: "Score calculated", type: "datetime", getValue: (r) => r.scoreCalculatedAt },
        { key: "outstanding", header: "Outstanding balance", type: "currency", getValue: (r) => r.outstanding },
        { key: "orders", header: "Recent orders", type: "integer", getValue: (r) => (r.orders.available ? r.orders.rows.length : null) },
        { key: "orders_source", header: "Recent orders source", getValue: (r) => r.orders.source },
        { key: "jobs", header: "Recent jobs", type: "integer", getValue: (r) => (r.jobs.available ? r.jobs.rows.length : null) },
        { key: "jobs_source", header: "Recent jobs source", getValue: (r) => r.jobs.source },
      ],
      rows: [summary],
    };

    const sheets: ExportSheet<any>[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any -- one row type per sheet
      customerSheet,
      {
        sheetName: "Contacts",
        columns: [
          { key: "name", header: "Name", getValue: (c: PartyContact) => [c.first_name, c.last_name].filter(Boolean).join(" ") },
          { key: "title", header: "Job title", getValue: (c: PartyContact) => c.job_title ?? "" },
          { key: "email", header: "Email", getValue: (c: PartyContact) => c.email ?? "" },
          { key: "phone", header: "Phone", getValue: (c: PartyContact) => c.phone ?? "" },
          { key: "primary", header: "Primary", type: "boolean", getValue: (c: PartyContact) => c.is_primary },
          { key: "status", header: "Status", getValue: (c: PartyContact) => humanize(c.status) },
        ],
        rows: contacts,
      },
      {
        sheetName: "Opportunities",
        columns: [
          { key: "stage", header: "Stage", getValue: (o: Customer360OpportunitySummary) => (o.stageId ? (stageNameById.get(o.stageId) ?? "") : "") },
          { key: "status", header: "Status", getValue: (o: Customer360OpportunitySummary) => humanize(o.status) },
          { key: "created", header: "Created", type: "datetime", getValue: (o: Customer360OpportunitySummary) => o.createdAt },
        ],
        rows: customer.openOpportunities,
      },
      {
        sheetName: "Follow-ups",
        columns: [
          { key: "due", header: "Due", type: "datetime", getValue: (f: FollowUp) => f.due_at },
          { key: "priority", header: "Priority", getValue: (f: FollowUp) => humanize(f.priority) },
          { key: "status", header: "Status", getValue: (f: FollowUp) => humanize(f.status) },
          { key: "owner", header: "Owner", getValue: (f: FollowUp) => ownerName(employeeById, f.owner_id) },
        ],
        rows: customer.openFollowUps,
      },
      {
        sheetName: "Products of Interest",
        columns: [
          { key: "item", header: "Product", getValue: (p: Customer360ProductInterest) => p.itemName },
          { key: "quantity", header: "Quantity", type: "number", getValue: (p: Customer360ProductInterest) => p.quantity },
        ],
        rows: customer.productsOfInterest,
      },
      {
        sheetName: "Recent Orders",
        columns: [
          { key: "kind", header: "Document", getValue: (o: ContractOrderSummary) => (o.kind === "invoice" ? "Invoice" : "Sales order") },
          { key: "number", header: "Number", getValue: (o: ContractOrderSummary) => o.number },
          { key: "status", header: "Status", getValue: (o: ContractOrderSummary) => humanize(o.status) },
          { key: "date", header: "Date", type: "date", getValue: (o: ContractOrderSummary) => o.orderDate },
          { key: "total", header: "Total", type: "currency", getValue: (o: ContractOrderSummary) => o.totalAmount },
        ],
        rows: orders.rows,
      },
      {
        sheetName: "Recent Jobs",
        columns: [
          { key: "number", header: "Job", getValue: (j: ContractJobSummary) => j.number ?? "" },
          { key: "status", header: "Status", getValue: (j: ContractJobSummary) => humanize(j.status) },
          { key: "description", header: "Description", getValue: (j: ContractJobSummary) => j.description ?? "" },
          { key: "scheduled", header: "Scheduled", type: "datetime", getValue: (j: ContractJobSummary) => j.scheduledAt },
          { key: "created", header: "Created", type: "datetime", getValue: (j: ContractJobSummary) => j.createdAt },
        ],
        rows: jobs.rows,
      },
      {
        sheetName: "Payment Aging",
        columns: [
          { key: "doc_type", header: "Document type", getValue: (a: DocumentAging) => humanize(a.doc_type) },
          { key: "number", header: "Number", getValue: (a: DocumentAging) => a.number ?? "" },
          { key: "due", header: "Due date", type: "date", getValue: (a: DocumentAging) => a.due_date },
          { key: "days_overdue", header: "Days overdue", type: "integer", getValue: (a: DocumentAging) => a.days_overdue },
          { key: "balance", header: "Balance", type: "currency", getValue: (a: DocumentAging) => a.balance_amount },
          { key: "bucket", header: "Aging bucket", getValue: (a: DocumentAging) => (a.aging_bucket === "current" ? "Current" : `${a.aging_bucket} days`) },
        ],
        rows: aging,
      },
      {
        sheetName: "Interactions",
        columns: [
          { key: "when", header: "Date", type: "datetime", getValue: (t: TimelineEntry) => t.occurredAt },
          { key: "source", header: "Source", getValue: (t: TimelineEntry) => TIMELINE_SOURCE_LABEL[t.source] ?? t.source },
          { key: "event", header: "Event", getValue: (t: TimelineEntry) => t.label },
          { key: "detail", header: "Detail", getValue: (t: TimelineEntry) => t.detail ?? "" },
        ],
        rows: timeline,
      },
      {
        sheetName: "Buying Intent Signals",
        columns: [
          { key: "signal", header: "Signal", getValue: (s: BuyingIntentSignal) => s.label },
          { key: "points", header: "Points", type: "number", getValue: (s: BuyingIntentSignal) => s.points },
          { key: "max", header: "Max points", type: "number", getValue: (s: BuyingIntentSignal) => s.maxPoints },
          { key: "evidence", header: "Evidence", getValue: (s: BuyingIntentSignal) => s.evidence ?? "" },
        ],
        rows: score?.signals ?? [],
      },
    ];

    return {
      module: "crm",
      resource: "customer-360",
      title: `Customer 360`,
      sheets,
    };
  },
};
