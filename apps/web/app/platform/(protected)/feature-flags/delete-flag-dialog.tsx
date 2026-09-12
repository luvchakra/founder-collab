"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Button } from "@cofounderai/core/ui/button";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { deleteFeatureFlagAction } from "./actions";

/** PLATFORM-P0-08.4 -- deleting a flag is a "change" too, so it requires a reason exactly
 * like create/update do (`platform.delete_feature_flag()`'s own server-side check). The
 * confirm button stays disabled until a reason is entered, mirroring
 * `ModuleStatusDialog`'s own "reason required before confirm" shape. */
export function DeleteFlagDialog({ id, featureKey }: { id: string; featureKey: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deleteFeatureFlagAction({ id, reason });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`"${featureKey}" deleted.`);
      setOpen(false);
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setReason("");
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
          aria-label={`Delete ${featureKey}`}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="border-zinc-800 bg-zinc-900 text-zinc-50">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &quot;{featureKey}&quot;?</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            Permanently removes this flag. Its history stays in the audit trail. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="delete-reason" className="text-zinc-300">
            Reason (required)
          </Label>
          <Textarea
            id="delete-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. No longer needed after the rollout finished"
            className="border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500"
            rows={2}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
            disabled={pending || reason.trim().length === 0}
            className="bg-red-600 text-white hover:bg-red-500"
          >
            {pending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
