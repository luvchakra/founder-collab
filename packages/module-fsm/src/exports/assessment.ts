// EXP-FSM-09 -- Assessment export, from the one page assessments have:
// /[businessSlug]/service/assessments/[assessmentId]. There is no assessments list page,
// so this exports that one assessment's structured record -- never an attachment or any
// file content.
//
// The story's "technician" field is not exported: an assessment has no technician (no
// such column on fsm.assessments, and the page shows none). "Follow-up" is the recorded
// outcome's own answer -- Yes only for "Follow-up required", blank until an outcome is
// recorded.
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { ExportDeniedError } from "@cofounderai/core/exports/server";
import { listAddressesForParty } from "@cofounderai/core/addresses/queries";
import { getParty, listContactsForParty } from "@cofounderai/core/parties/queries";
import { ASSESSMENT_OUTCOME_LABEL } from "../lib/assessments/mutations";
import { getAssessment } from "../lib/assessments/queries";
import type { Assessment } from "../lib/assessments/types";
import { ASSESSMENT_KIND_LABEL, ASSESSMENT_STATUS_LABEL, labelFor } from "./labels";
import { addressText } from "./queries";

type Filters = { assessmentId: string };

type Row = Assessment & { customer: string | null; contact: string | null; address: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const fsmAssessmentExport: ExportAdapter<Filters> = {
  id: "fsm.assessment",
  module: "fsm",
  // The assessment page is readable with the fsm licence and business membership (RLS)
  // alone -- `assessments.manage` only gates recording an outcome.
  permissions: [],
  parseFilters: (params) => {
    const id = params.get("assessmentId") ?? "";
    return { assessmentId: UUID.test(id) ? id : "" };
  },
  async load(context, filters) {
    // Found only within the business resolved from the URL -- exactly as the page's own
    // getAssessment(businessId, id) -- so another business's assessment id is a 404.
    const assessment = filters.assessmentId ? await getAssessment(context.businessId, filters.assessmentId) : null;
    if (!assessment) throw new ExportDeniedError("Assessment not found.", 404);

    const [party, contacts, addresses] = await Promise.all([
      getParty(assessment.party_id),
      listContactsForParty(assessment.party_id),
      listAddressesForParty(assessment.party_id),
    ]);
    const contact = assessment.primary_contact_id ? contacts.find((c) => c.id === assessment.primary_contact_id) : undefined;
    const address = assessment.service_address_id ? addresses.find((a) => a.id === assessment.service_address_id) : undefined;
    const row: Row = {
      ...assessment,
      customer: party?.name ?? null,
      contact: contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email || contact.phone || null : null,
      address: addressText(address),
    };

    return {
      module: "fsm",
      resource: "assessment",
      title: "Service assessment",
      sheets: [
        {
          sheetName: "Assessment",
          columns: [
            { key: "assessment", header: "Assessment", getValue: (r: Row) => labelFor(ASSESSMENT_KIND_LABEL, r.kind) },
            { key: "customer", header: "Customer", getValue: (r: Row) => r.customer },
            { key: "contact", header: "Contact", getValue: (r: Row) => r.contact },
            { key: "address", header: "Service address", getValue: (r: Row) => r.address },
            { key: "requested", header: "Requested", type: "datetime", getValue: (r: Row) => r.created_at },
            { key: "scheduled", header: "Scheduled", type: "datetime", getValue: (r: Row) => r.scheduled_at },
            { key: "completed", header: "Outcome recorded", type: "datetime", getValue: (r: Row) => r.completed_at },
            { key: "status", header: "Status", getValue: (r: Row) => labelFor(ASSESSMENT_STATUS_LABEL, r.status) },
            { key: "outcome", header: "Outcome", getValue: (r: Row) => labelFor(ASSESSMENT_OUTCOME_LABEL, r.outcome) },
            { key: "outcome_notes", header: "Outcome notes", getValue: (r: Row) => r.outcome_notes },
            {
              key: "follow_up",
              header: "Follow-up required",
              type: "boolean",
              getValue: (r: Row) => (r.outcome ? r.outcome === "follow_up_required" : null),
            },
            { key: "scope", header: "Requested scope", getValue: (r: Row) => r.requested_scope },
            { key: "customer_notes", header: "Customer notes", getValue: (r: Row) => r.customer_notes },
            { key: "timing", header: "Preferred timing", getValue: (r: Row) => r.preferred_timing },
            { key: "context", header: "Discovery context", getValue: (r: Row) => r.discovery_context },
          ],
          rows: [row],
        },
      ],
    };
  },
};
