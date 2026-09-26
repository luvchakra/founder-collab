// EXP-FSM-02 -- Service customers export: every customer on /[businessSlug]/service/customers,
// with contacts, address, service history, open work and outstanding balance.
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { listCustomersForExport, type CustomerExportRow } from "./queries";

export const fsmCustomersExport: ExportAdapter<Record<string, never>> = {
  id: "fsm.customers",
  module: "fsm",
  // The customers page is readable with the fsm licence and business membership (RLS)
  // alone -- `customers.edit` only gates its edit button. The outstanding balance is the
  // figure Reports > Customer balances already shows the same readers, so it needs no
  // extra permission either.
  permissions: [],
  // The page has no filters.
  parseFilters: () => ({}),
  async load(context) {
    const customers = await listCustomersForExport(context.businessId);
    return {
      module: "fsm",
      resource: "customers",
      title: "Service customers",
      sheets: [
        {
          sheetName: "Customers",
          columns: [
            { key: "customer", header: "Customer", getValue: (c: CustomerExportRow) => c.name },
            { key: "email", header: "Email", getValue: (c: CustomerExportRow) => c.email },
            { key: "phone", header: "Phone", getValue: (c: CustomerExportRow) => c.phone },
            { key: "contacts", header: "Contacts", getValue: (c: CustomerExportRow) => c.contacts },
            { key: "address", header: "Address", getValue: (c: CustomerExportRow) => c.address },
            { key: "jobs", header: "Jobs (all time)", type: "integer", getValue: (c: CustomerExportRow) => c.job_count },
            { key: "completed", header: "Jobs completed", type: "integer", getValue: (c: CustomerExportRow) => c.completed_job_count },
            { key: "open_jobs", header: "Open jobs", type: "integer", getValue: (c: CustomerExportRow) => c.open_job_count },
            { key: "open_opportunities", header: "Open opportunities", type: "integer", getValue: (c: CustomerExportRow) => c.open_opportunity_count },
            { key: "outstanding", header: "Outstanding balance", type: "currency", currency: "INR", getValue: (c: CustomerExportRow) => c.outstanding_balance },
            { key: "status", header: "Status", getValue: (c: CustomerExportRow) => (c.is_active ? "Active" : "Inactive") },
            { key: "since", header: "Customer since", type: "datetime", getValue: (c: CustomerExportRow) => c.created_at },
          ],
          rows: customers,
        },
      ],
    };
  },
};
