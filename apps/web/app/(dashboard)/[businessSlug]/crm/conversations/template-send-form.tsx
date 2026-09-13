"use client";

import { useActionState } from "react";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { SendWhatsAppTemplateActionState } from "./actions";

type TemplateOption = { id: string; name: string; language_code: string; variable_count: number };

/**
 * CRM-07.8's send path for a conversation whose 24-hour window has closed -- shown by
 * the page instead of `WhatsAppReplyForm` in that case. `variables` is a single
 * comma-separated field (see `sendWhatsAppTemplateAction`'s own doc comment for why);
 * the selected template's own variable count is shown as a hint, not enforced client-side.
 */
export function WhatsAppTemplateSendForm({
  templates,
  action,
}: {
  templates: TemplateOption[];
  action: (state: SendWhatsAppTemplateActionState, formData: FormData) => Promise<SendWhatsAppTemplateActionState>;
}) {
  const [state, formAction] = useActionState<SendWhatsAppTemplateActionState, FormData>(action, null);

  if (templates.length === 0) {
    return <p className="text-sm text-muted-foreground">No active templates registered yet -- add one under CRM &gt; WhatsApp.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="templateId">Template</Label>
        <NativeSelect id="templateId" name="templateId" defaultValue={templates[0]?.id}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.language_code}, {t.variable_count} var{t.variable_count === 1 ? "" : "s"})
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="variables">Variables (comma-separated)</Label>
        <Input id="variables" name="variables" placeholder="e.g. Priya, 5000" />
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <SubmitButton size="sm" pendingText="Sending..." className="self-end">
        Send template
      </SubmitButton>
    </form>
  );
}
