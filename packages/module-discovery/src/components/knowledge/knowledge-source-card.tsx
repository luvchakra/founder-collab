"use client";

import { useActionState, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { cn } from "@cofounderai/core/lib/utils";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { RenameActionState } from "../../lib/tenancy/types";

/**
 * Card for one knowledge source: Edit/Delete icons at top-right of the header row, content
 * spans the full card width (no character-count truncation), clamped to a few lines by
 * default with a click on the body toggling full expand/collapse.
 */
export function KnowledgeSourceCard({
  sourceName,
  sourceType,
  content,
  updateAction,
  deleteAction,
}: {
  sourceName: string;
  sourceType: string;
  content: string;
  updateAction: (prevState: RenameActionState, formData: FormData) => Promise<RenameActionState>;
  deleteAction: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [state, formAction, pending] = useActionState<RenameActionState, FormData>(
    updateAction,
    null,
  );

  // Adjust state during render (compare against previous), not a useEffect -- same
  // pattern the rest of this app's inline-edit controls use.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state && "success" in state && editing) setEditing(false);
  }

  return (
    <div className="rounded-md border">
      <div className="flex items-start justify-between gap-3 border-b px-3 py-2">
        <p className="min-w-0 truncate text-sm font-medium">
          {sourceName} <span className="font-normal text-muted-foreground">({sourceType})</span>
        </p>
        <div className="flex shrink-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setEditing((v) => !v);
              setExpanded(true);
            }}
            aria-label={editing ? "Cancel edit" : "Edit source"}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <Pencil className="size-4" aria-hidden="true" />
          </button>
          <form action={deleteAction}>
            <button
              type="submit"
              aria-label="Delete source"
              className="text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>

      {editing ? (
        <form action={formAction} className="flex flex-col gap-2 p-3">
          <Textarea name="value" defaultValue={content} autoFocus rows={6} />
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
      ) : (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="block w-full p-3 text-left text-sm text-muted-foreground hover:bg-accent/40"
        >
          <p className={cn("w-full whitespace-pre-wrap", !expanded && "line-clamp-3")}>
            {content}
          </p>
        </button>
      )}
    </div>
  );
}
