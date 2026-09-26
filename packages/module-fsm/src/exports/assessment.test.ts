import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportContext } from "@cofounderai/core/exports/server";
import { renderExport } from "@cofounderai/core/exports/render";
import type { ExportWorkbookDefinition } from "@cofounderai/core/exports/types";
import type { Assessment } from "../lib/assessments/types";

// EXP-FSM-09 -- Assessment export, from the assessment detail page. Metadata only: no
// attachment or file content ever reaches the workbook.

const state = vi.hoisted(() => ({ assessment: null as unknown }));
const getAssessment = vi.hoisted(() => vi.fn(async () => state.assessment));
const getParty = vi.hoisted(() => vi.fn(async () => ({ id: "party-1", name: "Asha Traders" })));
const listContactsForParty = vi.hoisted(() =>
  vi.fn(async () => [{ id: "contact-1", first_name: "Anu", last_name: "K", email: "anu@example.com", phone: null }]),
);
const listAddressesForParty = vi.hoisted(() =>
  vi.fn(async () => [{ id: "addr-1", formatted: null, city: "Pune", state: "MH", postal_code: null, country: null }]),
);
vi.mock("../lib/assessments/queries", () => ({ getAssessment }));
vi.mock("../lib/assessments/mutations", () => ({
  ASSESSMENT_OUTCOME_LABEL: {
    scope_confirmed: "Scope confirmed",
    scope_changed: "Scope changed",
    additional_work_identified: "Additional work identified",
    not_feasible: "Not feasible",
    customer_unavailable: "Customer unavailable",
    follow_up_required: "Follow-up required",
  },
}));
vi.mock("@cofounderai/core/parties/queries", () => ({ getParty, listContactsForParty }));
vi.mock("@cofounderai/core/addresses/queries", () => ({ listAddressesForParty }));

import { ExportDeniedError } from "@cofounderai/core/exports/server";
import { fsmAssessmentExport } from "./assessment";

const ASSESSMENT_ID = "3f1c2b8a-1111-4222-8333-944455556666";

const context: ExportContext = {
  businessId: "biz-a",
  businessSlug: "acme",
  businessName: "Acme Services",
  timeZone: "Asia/Kolkata",
  userId: "user-1",
  userEmail: "owner@example.com",
  format: "csv",
  scope: "view",
};

async function csv(workbook: ExportWorkbookDefinition): Promise<string[]> {
  const file = await renderExport(workbook, "csv", { timeZone: context.timeZone, generatedAt: new Date("2026-09-26T06:00:00Z") });
  return new TextDecoder().decode(file.body).trim().split("\r\n");
}

const base: Assessment = {
  id: ASSESSMENT_ID,
  business_id: "biz-a",
  party_id: "party-1",
  primary_contact_id: "contact-1",
  service_address_id: "addr-1",
  source: "crm",
  source_reference: "crm-opportunity-secret",
  kind: "on_site",
  requested_scope: "Inspect the chiller",
  customer_notes: null,
  discovery_context: null,
  preferred_timing: "Mornings",
  status: "completed",
  outcome: "follow_up_required",
  outcome_notes: "Needs a part",
  scheduled_at: "2026-09-20T04:30:00Z",
  completed_at: "2026-09-21T06:30:00Z",
  created_by: "user-9",
  created_at: "2026-09-18T04:30:00Z",
  updated_at: "2026-09-21T06:30:00Z",
};

beforeEach(() => {
  state.assessment = base;
  vi.clearAllMocks();
});

describe("fsm.assessment (EXP-FSM-09)", () => {
  it("is licence-gated with the page's own (empty) permission set", () => {
    expect(fsmAssessmentExport).toMatchObject({ id: "fsm.assessment", module: "fsm", permissions: [] });
  });

  it("takes only a well-formed assessment id from the request", () => {
    const parse = (q: string) => fsmAssessmentExport.parseFilters!(new URLSearchParams(q));
    expect(parse(`assessmentId=${ASSESSMENT_ID}&businessId=biz-b`)).toEqual({ assessmentId: ASSESSMENT_ID });
    expect(parse("assessmentId=1 or 1=1")).toEqual({ assessmentId: "" });
  });

  it("looks the assessment up within the resolved business only", async () => {
    await fsmAssessmentExport.load(context, { assessmentId: ASSESSMENT_ID });
    expect(getAssessment).toHaveBeenCalledWith("biz-a", ASSESSMENT_ID);
  });

  it("is a 404 when the assessment isn't in this business (or no id was given)", async () => {
    state.assessment = null;
    await expect(fsmAssessmentExport.load(context, { assessmentId: ASSESSMENT_ID })).rejects.toMatchObject({ status: 404 });
    await expect(fsmAssessmentExport.load(context, { assessmentId: "" })).rejects.toBeInstanceOf(ExportDeniedError);
    expect(getParty).not.toHaveBeenCalled();
  });

  it("writes the record with labels, and follow-up from the recorded outcome", async () => {
    const [header, line] = await csv(await fsmAssessmentExport.load(context, { assessmentId: ASSESSMENT_ID }));
    expect(header).toBe(
      "Assessment,Customer,Contact,Service address,Requested,Scheduled,Outcome recorded,Status,Outcome,Outcome notes,Follow-up required,Requested scope,Customer notes,Preferred timing,Discovery context",
    );
    expect(line).toBe(
      "On-site,Asha Traders,Anu K,\"Pune, MH\",2026-09-18T10:00:00+05:30,2026-09-20T10:00:00+05:30,2026-09-21T12:00:00+05:30,Completed,Follow-up required,Needs a part,Yes,Inspect the chiller,,Mornings,",
    );
    expect(line).not.toMatch(/crm-opportunity-secret|party-1|addr-1|contact-1/);
  });

  it("leaves follow-up blank until an outcome is recorded", async () => {
    state.assessment = { ...base, status: "requested", outcome: null, outcome_notes: null, completed_at: null, primary_contact_id: null, service_address_id: null };
    const [, line] = await csv(await fsmAssessmentExport.load(context, { assessmentId: ASSESSMENT_ID }));
    expect(line).toBe("On-site,Asha Traders,,,2026-09-18T10:00:00+05:30,2026-09-20T10:00:00+05:30,,Requested,,,,Inspect the chiller,,Mornings,");
  });
});
