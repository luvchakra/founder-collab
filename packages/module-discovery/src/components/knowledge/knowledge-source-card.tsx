"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";
import { cn } from "@cofounderai/core/lib/utils";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { toast } from "@cofounderai/core/ui/sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@cofounderai/core/ui/alert-dialog";
import type { RenameActionState } from "../../lib/tenancy/types";

/**
 * Card for one knowledge source: Edit/Delete icons at top-right of the header row, content
 * spans the full card width (no character-count truncation), clamped to a few lines by
 * default with a click on the body toggling full expand/collapse.
 *
 * Delete is a direct call + router.refresh() (matching delete-product-button.tsx's own
 * pattern), not a raw `<form action={deleteAction}>` -- that combination with Radix's
 * `AlertDialogAction asChild` (which closes the dialog on click, immediately unmounting
 * the nested form) was the real bug behind "delete doesn't do anything": the dialog closing
 * out from under the form could beat the form's own submit handling, and even when it
 * didn't, a thrown error from the server action had nowhere to surface -- the raw form had
 * no error UI, so a failed delete looked identical to a silently-ignored click.
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
  deleteAction: () => Promise<{ error: string } | { success: true }>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [deleting, startDeleting] = useTransition();
  const [state, formAction, pending] = useActionState<RenameActionState, FormData>(
    updateAction,
    null,
  );

  function confirmDelete() {
    startDeleting(async () => {
      const result = await deleteAction();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      router.refresh();
      toast.success(`Deleted "${sourceName}".`);
    });
  }

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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                aria-label="Delete source"
                disabled={deleting}
                className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete &quot;{sourceName}&quot;?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the knowledge source and cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep source</AlertDialogCancel>
                <AlertDialogAction
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
