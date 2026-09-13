import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Badge } from "@cofounderai/core/ui/badge";
import { FULFILLMENT_REQUIREMENT_LABEL } from "@cofounderai/module-crm/lib/opportunities/fulfillment";
import type { FulfillmentRequirement } from "@cofounderai/module-crm/lib/opportunities/types";

const OPTIONS = Object.keys(FULFILLMENT_REQUIREMENT_LABEL) as FulfillmentRequirement[];

/**
 * INT-02.1's "Fulfillment Requirement Gate" -- explicit before closure, not a silent
 * auto-classification: the dropdown always defaults to the already-confirmed value once
 * one exists, or the deterministic suggestion when it doesn't -- either way nothing is
 * written until the human actually submits the form (a plain server-action form, same
 * shape as the Owner assign form already on this page; no client component needed).
 */
export function FulfillmentGate({
  value,
  suggested,
  action,
}: {
  value: FulfillmentRequirement | null;
  suggested: FulfillmentRequirement;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Fulfillment:</span>
      {!value ? <Badge variant="outline">Not yet set</Badge> : null}
      <NativeSelect name="fulfillmentRequirement" defaultValue={value ?? suggested} className="w-auto">
        {OPTIONS.map((option) => (
          <option key={option} value={option}>
            {FULFILLMENT_REQUIREMENT_LABEL[option]}
          </option>
        ))}
      </NativeSelect>
      <SubmitButton size="sm" variant="outline" pendingText="Saving...">
        {value ? "Update" : "Confirm"}
      </SubmitButton>
    </form>
  );
}
