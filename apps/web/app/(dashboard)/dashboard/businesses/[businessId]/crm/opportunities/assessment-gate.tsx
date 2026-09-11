import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Badge } from "@cofounderai/core/ui/badge";
import { ASSESSMENT_REQUIREMENT_LABEL } from "@cofounderai/module-crm/lib/opportunities/assessment";
import type { AssessmentRequirement } from "@cofounderai/module-crm/lib/opportunities/types";

const OPTIONS = Object.keys(ASSESSMENT_REQUIREMENT_LABEL) as AssessmentRequirement[];

/**
 * INT-04.1's "Opportunity Requires Assessment" gate -- same shape as `FulfillmentGate`
 * (INT-02.1), a plain server-action form defaulting to the already-confirmed value or
 * `none` when nothing's been set yet. No `suggested` prop here -- unlike fulfillment,
 * there's no existing signal this story could derive a smart default from.
 */
export function AssessmentGate({
  value,
  action,
}: {
  value: AssessmentRequirement | null;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Assessment:</span>
      {!value ? <Badge variant="outline">Not yet set</Badge> : null}
      <NativeSelect name="assessmentRequirement" defaultValue={value ?? "none"} className="w-auto">
        {OPTIONS.map((option) => (
          <option key={option} value={option}>
            {ASSESSMENT_REQUIREMENT_LABEL[option]}
          </option>
        ))}
      </NativeSelect>
      <SubmitButton size="sm" variant="outline" pendingText="Saving...">
        {value ? "Update" : "Confirm"}
      </SubmitButton>
    </form>
  );
}
