import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import { getAssessment } from "@cofounderai/module-fsm/lib/assessments/queries";
import { ASSESSMENT_OUTCOME_LABEL } from "@cofounderai/module-fsm/lib/assessments/mutations";
import { getParty, listContactsForParty } from "@cofounderai/core/parties/queries";
import { listAddressesForParty } from "@cofounderai/core/addresses/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { formatDateTime } from "@cofounderai/core/lib/format";
import { Badge } from "@cofounderai/core/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Textarea } from "@cofounderai/core/ui/textarea";
import type { AssessmentOutcome } from "@cofounderai/module-fsm/lib/assessments/types";
import { recordAssessmentOutcomeAction } from "./actions";

const KIND_LABEL: Record<string, string> = { remote: "Remote", on_site: "On-site", technical: "Technical" };
const STATUS_LABEL: Record<string, string> = {
  requested: "Requested",
  scheduled: "Scheduled",
  completed: "Completed",
  not_feasible: "Not feasible",
  cancelled: "Cancelled",
};

export default async function AssessmentDetailPage({ params }: { params: Promise<{ businessId: string; assessmentId: string }> }) {
  const { businessId, assessmentId } = await params;
  const [business, assessment] = await Promise.all([getBusiness(businessId), getAssessment(businessId, assessmentId)]);
  if (!business || !assessment) notFound();

  const [party, contacts, addresses, canManage] = await Promise.all([
    getParty(assessment.party_id),
    listContactsForParty(assessment.party_id),
    listAddressesForParty(assessment.party_id),
    hasPermission(businessId, "assessments.manage"),
  ]);
  const contact = assessment.primary_contact_id ? contacts.find((c) => c.id === assessment.primary_contact_id) : null;
  const address = assessment.service_address_id ? addresses.find((a) => a.id === assessment.service_address_id) : null;
  const canRecordOutcome = canManage && (assessment.status === "requested" || assessment.status === "scheduled");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{party?.name ?? "Assessment"}</h1>
          <Badge variant={assessment.status === "not_feasible" ? "destructive" : assessment.status === "completed" ? "secondary" : "outline"} className="capitalize">
            {STATUS_LABEL[assessment.status] ?? assessment.status}
          </Badge>
          <Badge variant="outline">{KIND_LABEL[assessment.kind] ?? assessment.kind}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">Requested {formatDateTime(assessment.created_at)}</p>
        {/* INT-08.3's "Context-Preserving Navigation" -- this assessment is only ever
            reachable via the CRM opportunity page's own "Open in FSM" link (INT-04.2's
            doc comment already flagged this as a down payment on this exact story), but
            nothing here led back until now, even though source_reference has carried
            the CRM opportunity id since this table's own first migration. */}
        {assessment.source === "crm" && assessment.source_reference ? (
          <a href={`/dashboard/businesses/${businessId}/crm/opportunities/${assessment.source_reference}`} className="mt-1 inline-block text-xs text-primary hover:underline">
            From CRM opportunity →
          </a>
        ) : null}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            <span className="text-muted-foreground">Contact: </span>
            {contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email || contact.phone || "Unnamed contact" : "Not on file"}
          </p>
          <p>
            <span className="text-muted-foreground">Service address: </span>
            {address ? (address.formatted ?? [address.city, address.state].filter(Boolean).join(", ")) || "On file" : "Not on file"}
          </p>
          {assessment.requested_scope ? (
            <p>
              <span className="text-muted-foreground">Requested scope: </span>
              {assessment.requested_scope}
            </p>
          ) : null}
          {assessment.customer_notes ? (
            <p>
              <span className="text-muted-foreground">Customer notes: </span>
              {assessment.customer_notes}
            </p>
          ) : null}
          {assessment.discovery_context ? (
            <p>
              <span className="text-muted-foreground">Discovery context: </span>
              {assessment.discovery_context}
            </p>
          ) : null}
          {assessment.preferred_timing ? (
            <p>
              <span className="text-muted-foreground">Preferred timing: </span>
              {assessment.preferred_timing}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Outcome</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {assessment.outcome ? (
            <div className="flex flex-col gap-2 text-sm">
              <Badge variant="secondary" className="w-fit capitalize">
                {ASSESSMENT_OUTCOME_LABEL[assessment.outcome as AssessmentOutcome] ?? assessment.outcome}
              </Badge>
              {assessment.outcome_notes ? <p className="text-muted-foreground">{assessment.outcome_notes}</p> : null}
              {assessment.completed_at ? <p className="text-xs text-muted-foreground">Recorded {formatDateTime(assessment.completed_at)}</p> : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No outcome recorded yet.</p>
          )}

          {canRecordOutcome ? (
            <form action={recordAssessmentOutcomeAction.bind(null, businessId, assessmentId)} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="outcome">Outcome</Label>
                <NativeSelect id="outcome" name="outcome" defaultValue="scope_confirmed">
                  {(Object.entries(ASSESSMENT_OUTCOME_LABEL) as [AssessmentOutcome, string][]).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="outcomeNotes">Notes</Label>
                <Textarea id="outcomeNotes" name="outcomeNotes" rows={3} />
              </div>
              <SubmitButton pendingText="Saving..." className="w-fit">
                Record outcome
              </SubmitButton>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
