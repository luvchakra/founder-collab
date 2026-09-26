// EXP-CRM-02 -- CRM leads export (/crm/leads).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import type { Lead } from "../lib/leads/types";
import { listEmployeeOptions } from "../lib/tickets/queries";
import { SOURCE_CHANNEL_LABEL, employeeMap, humanize, labelOf, ownerName } from "./labels";
import { listLeadsForExport, listPartiesForExport, type ExportParty } from "./queries";

type LeadRow = Lead & { party: ExportParty | undefined };

/**
 * The Leads page lists every lead with no filters of its own, so neither does this
 * export -- a `status`/`owner` param in the request is ignored rather than quietly
 * narrowing the file to something the page never showed. Contact details (email,
 * phone) are the lead's own `core.parties` row, which the CRM viewer can already read
 * under RLS on the lead's Customer 360 page.
 */
export const crmLeadsExport: ExportAdapter<Record<string, never>> = {
  id: "crm.leads",
  module: "crm",
  permissions: ["crm.view"],
  parseFilters: () => ({}),
  async load(context) {
    const [leads, employees] = await Promise.all([listLeadsForExport(context.businessId), listEmployeeOptions(context.businessId)]);
    const parties = await listPartiesForExport(
      context.businessId,
      leads.map((l) => l.party_id),
    );
    const employeeById = employeeMap(employees);
    const rows: LeadRow[] = leads.map((lead) => ({ ...lead, party: parties.get(lead.party_id) }));

    return {
      module: "crm",
      resource: "leads",
      title: "CRM leads",
      sheets: [
        {
          sheetName: "Leads",
          columns: [
            { key: "contact", header: "Contact", getValue: (r: LeadRow) => r.party?.name ?? "Unknown contact" },
            { key: "company", header: "Company", getValue: (r: LeadRow) => (r.party?.kind === "company" ? r.party.name : "") },
            { key: "email", header: "Email", getValue: (r: LeadRow) => r.party?.email ?? "" },
            { key: "phone", header: "Phone", getValue: (r: LeadRow) => r.party?.phone ?? "" },
            { key: "source", header: "Source", getValue: (r: LeadRow) => labelOf(SOURCE_CHANNEL_LABEL, r.source) },
            { key: "status", header: "Status", getValue: (r: LeadRow) => humanize(r.status) },
            { key: "owner", header: "Owner", getValue: (r: LeadRow) => ownerName(employeeById, r.owner_id) },
            { key: "created", header: "Created", type: "datetime", getValue: (r: LeadRow) => r.created_at },
            { key: "updated", header: "Last updated", type: "datetime", getValue: (r: LeadRow) => r.updated_at },
          ],
          rows,
        },
      ],
    };
  },
};
