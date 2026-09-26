"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@cofounderai/core/ui/alert-dialog";
import { Button } from "@cofounderai/core/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@cofounderai/core/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@cofounderai/core/ui/dropdown-menu";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { toast } from "@cofounderai/core/ui/sonner";

type ActionResult = { error: string } | { success: true };

/**
 * DISC-OFFER-P1-01.3 "Account Watchlist" -- the watchlist row's own edit affordance, so a
 * founder working down the review queue can change the reason or push the next review
 * out without leaving the list (design rule 4: no detail-page round trip for a simple
 * edit). "Edit" opens the same two fields `WatchlistToggle` shows on the account page;
 * "Stop watching" is separated in the menu and confirmed, since it removes the entry.
 */
export function WatchlistRowActions({
  companyName,
  watchReason,
  nextReviewAt,
  accountHref,
  updateAction,
  removeAction,
}: {
  companyName: string;
  watchReason: string;
  nextReviewAt: string | null;
  accountHref: string;
  updateAction: (formData: FormData) => Promise<ActionResult>;
  removeAction: () => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function run(action: () => Promise<ActionResult>, successMessage: string, onDone?: () => void) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      onDone?.();
      router.refresh();
      toast.success(successMessage);
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} disabled={pending}>
        <Pencil className="size-3.5" aria-hidden="true" />
        Edit
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={pending} aria-label={`More actions for ${companyName}`}>
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={accountHref}>Open account</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirmOpen(true)}>
            Stop watching
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit watch · {companyName}</DialogTitle>
          </DialogHeader>
          <form
            action={(formData) => run(() => updateAction(formData), `Updated the watch on ${companyName}.`, () => setEditOpen(false))}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="watchReason">Watch reason</Label>
              <Input id="watchReason" name="watchReason" defaultValue={watchReason} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nextReviewAt">Next review</Label>
              <Input id="nextReviewAt" name="nextReviewAt" type="date" defaultValue={nextReviewAt ? nextReviewAt.slice(0, 10) : ""} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <SubmitButton pendingText="Saving...">Save</SubmitButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop watching {companyName}?</AlertDialogTitle>
            <AlertDialogDescription>
              It leaves this offering&apos;s watchlist. The account, its signals and any watch under another offering stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep watching</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => run(removeAction, `Stopped watching ${companyName}.`)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Stop watching
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
