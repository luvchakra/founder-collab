import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { listCrossModuleExceptions } from "@cofounderai/module-crm/lib/exceptions/queries";
import type { CrossModuleException } from "@cofounderai/module-crm/lib/exceptions/types";
import type { JobPartsShortageResolution } from "@cofounderai/module-fsm/lib/jobs/types";
import { Badge } from "@cofounderai/core/ui/badge";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Input } from "@cofounderai/core/ui/input";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { CheckCircle2 } from "lucide-react";
import { requestExceptionAssessmentAction, resolveExceptionPartsShortageAction } from "./actions";

const SHORTAGE_RESOLUTION_LABEL: Record<JobPartsShortageResolution, string> = {
  await_replenishment: "Wait for replenishment",
  substitute_item: "Substitute item",
  reschedule_job: "Reschedule the job",
  obtain_manually: "Obtain manually (outside this system)",
};

const MODULE_LABEL: Record<CrossModuleException["module"], string> = { fsm: "FSM", crm: "CRM" };

/**
 * INT-07.2's "Exception Resolution Actions" -- the Exception Center list INT-07.1's
 * model needed a home for once it had a genuine business-wide read: every open
 * cross-module exception, one screen, each row actionable in place (no navigating away
 * to resolve it), same "actionable from one screen" principle the Follow-up Queue
 * (CRM-05.3) already established for a different kind of worklist.
 *
 * Two resolution shapes, matching what each exception kind's own underlying state
 * actually supports (INT-07.1's own doc comment on why only these two kinds exist):
 * a parts shortage gets the real 4-option resolution picker (same vocabulary/mutation
 * as the FSM job page's own INT-03.3 picker); an unrequested assessment gets a one-
 * click "Request assessment" button. An already-requested assessment gets neither --
 * recording a real outcome needs narrative detail only FSM's own assessment page
 * collects, so this list only ever links out to it, it doesn't invent a second,
 * thinner way to do the same thing.
 */
export default async function CrmExceptionsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const exceptions = await listCrossModuleExceptions(businessId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Exceptions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {business.name}&apos;s open cross-module exceptions -- parts shortages and assessments waiting on a decision.
        </p>
      </div>

      {exceptions.length === 0 ? (
        <EmptyState message="No open exceptions right now." />
      ) : (
        <div className="flex flex-col divide-y rounded-2xl border border-border">
          {exceptions.map((exception) => (
            <div key={exception.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{MODULE_LABEL[exception.module]}</Badge>
                  <Link href={exception.detailHref} className="font-medium hover:underline">
                    {exception.label}
                  </Link>
                </div>
                {exception.detail ? <p className="mt-1 text-xs text-muted-foreground">{exception.detail}</p> : null}
              </div>

              <div className="shrink-0">
                {exception.kind === "fsm_parts_shortage" ? (
                  <form action={resolveExceptionPartsShortageAction.bind(null, businessId, exception.entityId)} className="flex flex-wrap items-end gap-2">
                    <NativeSelect name="resolution" defaultValue="await_replenishment" className="h-8 w-auto text-xs">
                      {(Object.keys(SHORTAGE_RESOLUTION_LABEL) as JobPartsShortageResolution[]).map((resolution) => (
                        <option key={resolution} value={resolution}>
                          {SHORTAGE_RESOLUTION_LABEL[resolution]}
                        </option>
                      ))}
                    </NativeSelect>
                    <Input name="note" placeholder="Note (optional)" className="h-8 w-40 text-xs" />
                    <SubmitButton size="sm" variant="outline" pendingText="Resolving..." className="h-8 px-2 text-xs">
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      Resolve
                    </SubmitButton>
                  </form>
                ) : exception.kind === "assessment_pending" && !exception.assessmentRequested ? (
                  <form action={requestExceptionAssessmentAction.bind(null, businessId, exception.entityId)}>
                    <SubmitButton size="sm" variant="outline" pendingText="Requesting..." className="h-8 px-2 text-xs">
                      Request assessment
                    </SubmitButton>
                  </form>
                ) : (
                  <Link href={exception.detailHref} className="text-xs text-primary underline">
                    Open in FSM
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
