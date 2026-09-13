"use client";

import { useActionState } from "react";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { CreateWhatsAppTemplateActionState } from "./actions";

/** CRM-07.8: registers one already-Meta-approved template by name/language/variable
 * count -- same `useActionState` shape as the connect form just above it on this page. */
export function AddWhatsAppTemplateForm({ action }: { action: (state: CreateWhatsAppTemplateActionState, formData: FormData) => Promise<CreateWhatsAppTemplateActionState> }) {
  const [state, formAction] = useActionState<CreateWhatsAppTemplateActionState, FormData>(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="templateName">Template name</Label>
        <Input id="templateName" name="name" placeholder="e.g. order_confirmation" required />
      </div>
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="templateLanguageCode">Language code</Label>
          <Input id="templateLanguageCode" name="languageCode" placeholder="en_US" required />
        </div>
        <div className="flex w-32 flex-col gap-1.5">
          <Label htmlFor="templateVariableCount">Variables</Label>
          <Input id="templateVariableCount" name="variableCount" type="number" min={0} defaultValue={0} required />
        </div>
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <SubmitButton size="sm" variant="outline" pendingText="Saving..." className="self-start">
        Add template
      </SubmitButton>
    </form>
  );
}
