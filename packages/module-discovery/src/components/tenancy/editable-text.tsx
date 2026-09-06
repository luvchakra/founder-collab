"use client";

import { useActionState, useState } from "react";
import { Pencil, X } from "lucide-react";
import { cn } from "@cofounderai/core/lib/utils";
import { Input } from "@cofounderai/core/ui/input";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { RenameActionState } from "../../lib/tenancy/types";

/**
 * Inline edit control for an optional text field (business/product description,
 * product website) -- same collapsed-by-default, click-to-edit pattern as EditableName,
 * but for a field that can be empty (shows `placeholder` as a muted prompt rather than
 * the field being required) and can be multiline. Submits `value` (not `name` --
 * EditableName's field) to whichever action the caller binds.
 */
export function EditableText({
  value,
  action,
  placeholder,
  multiline = false,
  textClassName,
}: {
  value: string | null;
  action: (prevState: RenameActionState, formData: FormData) => Promise<RenameActionState>;
  placeholder: string;
  multiline?: boolean;
  textClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<RenameActionState, FormData>(
    action,
    null,
  );

  // Exit edit mode once a save succeeds -- adjusting state during render (comparing
  // against the previous value) rather than in a useEffect, per React's own guidance on
  // avoiding a setState-in-effect render cascade.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state && "success" in state && editing) setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        <p className={cn(textClassName, !value && "text-muted-foreground italic")}>
          {value || placeholder}
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={value ? "Edit" : placeholder}
          className="mt-0.5 shrink-0 text-muted-foreground transition-[color,transform] duration-100 hover:text-foreground active:scale-90"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    );
  }

  const Field = multiline ? Textarea : Input;

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Field name="value" defaultValue={value ?? ""} autoFocus {...(multiline ? { rows: 1 } : {})} />
      <div className="flex items-center gap-2">
        <SubmitButton size="sm" pendingText="Saving...">
          Save
        </SubmitButton>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          aria-label="Cancel"
          className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
        {state && "error" in state ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
