"use client";

import { useActionState, useRef, useState } from "react";
import { Pencil, X } from "lucide-react";
import { Input } from "@cofounderai/core/ui/input";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { RenameActionState } from "../../lib/tenancy/types";
import { useAutoPopulateProgress } from "./auto-populate-progress";

/**
 * Inline rename control for a business or product name. Collapsed to a plain heading +
 * pencil button by default; clicking it reveals a text input in place, submitting to
 * whichever rename action the caller binds (renameBusinessAction / renameProductAction).
 * Exits edit mode automatically once the action reports success -- the fresh name then
 * arrives through the `name` prop itself via the action's own revalidatePath.
 */
export function EditableName({
  name,
  action,
  headingClassName,
}: {
  name: string;
  action: (prevState: RenameActionState, formData: FormData) => Promise<RenameActionState>;
  headingClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<RenameActionState, FormData>(
    action,
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  // No-op outside a product layout's AutoPopulateProgressProvider (e.g. renaming a
  // business) -- only meaningful here for a product name, which the auto-populate flow
  // itself doesn't touch, but the flow does touch that product's profile/ICP/prospects,
  // so renaming mid-run is still a real race worth blocking, same as every other control
  // product-overview-shell.tsx's fieldset already disables.
  const { activeStage } = useAutoPopulateProgress();
  const populating = activeStage !== null;

  // Exit edit mode the moment a save succeeds, without a setState-in-effect render
  // cascade: React's documented pattern for adjusting state in response to a change is to
  // compare against the previous value during render, not in a useEffect.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state && "success" in state && editing) setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className={headingClassName}>{name}</h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={populating}
          aria-label={`Rename ${name}`}
          title={populating ? "Wait for auto-populate to finish" : undefined}
          className="text-muted-foreground transition-[color,transform] duration-100 hover:text-foreground active:scale-90 disabled:pointer-events-none disabled:opacity-40"
        >
          <Pencil className="size-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <Input
        ref={inputRef}
        name="name"
        defaultValue={name}
        required
        autoFocus
        className="h-8 max-w-64 text-base font-semibold"
      />
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
    </form>
  );
}
