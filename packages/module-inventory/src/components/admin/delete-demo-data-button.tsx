"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
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

/** Confirmation wrapper for the admin seed tool's destructive "delete demo data" action
 * -- ported from stockpilot-ai-ops's own AlertDialog usage in admin.tsx. The actual
 * delete only ever removes rows this tool itself tracked (core.demo_seed_records), never
 * a business's real data -- but it's still an irreversible bulk delete, so it gets the
 * same confirm-before-destroy treatment as any other one in this codebase. */
export function DeleteDemoDataButton({
  businessName,
  batchCount,
  action,
  disabled,
}: {
  businessName: string;
  batchCount: number;
  action: () => Promise<void>;
  disabled?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={disabled}>
          <Trash2 className="size-4" aria-hidden="true" />
          Delete demo data
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete all demo data for {businessName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes every record ever seeded by this tool for this business -- across
            all {batchCount} seed run(s) -- and cannot be undone. It never touches data the
            business&apos;s own users created.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form action={action}>
            <AlertDialogAction asChild>
              <SubmitButton
                variant="destructive"
                pendingText="Deleting..."
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete demo data
              </SubmitButton>
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
