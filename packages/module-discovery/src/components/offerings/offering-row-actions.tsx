"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, MoreHorizontal, Trash2 } from "lucide-react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@cofounderai/core/ui/dropdown-menu";
import { toast } from "@cofounderai/core/ui/sonner";
import { OFFERING_STATUS_LABEL } from "../../lib/offerings/types";
import type { OfferingStatus } from "../../lib/offerings/types";

type ActionResult = { error: string } | { success: true };

/**
 * DISC-OFFER-P0-01.3's "Activate/deactivate", "Archive", and "Duplicate/clone" -- one
 * "•••" menu per row (this platform's own convention for row actions once there are
 * more than one or two, e.g. the cross-module Exception Center/Follow-up rows), plus
 * the always-visible destructive Delete gated behind the existing AlertDialog
 * confirmation pattern (matching `delete-product-button.tsx`'s own naming of the
 * prospect count at stake). The three status options only show whichever the offering
 * ISN'T already in -- no "Archive" item on an already-archived row.
 */
export function OfferingRowActions({
  offeringName,
  status,
  prospectCount,
  setStatusAction,
  duplicateAction,
  deleteAction,
}: {
  offeringName: string;
  status: OfferingStatus;
  prospectCount: number;
  setStatusAction: (status: OfferingStatus) => Promise<ActionResult>;
  duplicateAction: () => Promise<ActionResult>;
  deleteAction: () => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>, successMessage: string) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      router.refresh();
      toast.success(successMessage);
    });
  }

  const otherStatuses = (["active", "inactive", "archived"] as OfferingStatus[]).filter((s) => s !== status);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={pending} aria-label={`More actions for ${offeringName}`}>
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => run(duplicateAction, `Duplicated "${offeringName}".`)}>
            <Copy className="size-4" aria-hidden="true" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {otherStatuses.map((next) => (
            <DropdownMenuItem key={next} onSelect={() => run(() => setStatusAction(next), `"${offeringName}" is now ${OFFERING_STATUS_LABEL[next].toLowerCase()}.`)}>
              Set {OFFERING_STATUS_LABEL[next].toLowerCase()}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive">
                <Trash2 className="size-4" aria-hidden="true" />
                Delete
              </DropdownMenuItem>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete &quot;{offeringName}&quot;?</AlertDialogTitle>
                <AlertDialogDescription>
                  {prospectCount > 0
                    ? `This permanently deletes ${offeringName} and everything in its workspace, including ${prospectCount} prospect${prospectCount === 1 ? "" : "s"} and all their research. This cannot be undone.`
                    : `This permanently deletes ${offeringName}. It has no prospects yet, so nothing else is lost. This cannot be undone.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep offering</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => run(deleteAction, `Deleted "${offeringName}".`)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
