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
import { removeAiProviderKeyAction } from "./actions";

/** PLATFORM-P0-09.2 -- removing a key is a "change" too, matching
 * `platform.remove_ai_provider_key()`'s own server-side reason check. Disables (does not
 * delete) the provider's own ability to serve calls with the platform's included credit --
 * `enabled` is untouched, so a superadmin removing a key does not also need to remember to
 * flip it off separately if that's not what they want; there is simply no key left for it
 * to use. */
export function RemoveKeyDialog({ provider, label }: { provider: "openai" | "anthropic" | "google"; label: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await removeAiProviderKeyAction({ provider, reason });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${label}'s key removed.`);
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
          aria-label={`Remove ${label}'s key`}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Remove key
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="border-zinc-800 bg-zinc-900 text-zinc-50">
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {label}&apos;s key?</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            {label} will have no platform-level credential until a new key is set. This does not change any
            business&apos;s own connected BYOK key. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="remove-key-reason" className="text-zinc-300">
            Reason (required)
          </Label>
          <Textarea
            id="remove-key-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Credential compromised, rotating out of band"
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
            {pending ? "Removing…" : "Remove key"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
