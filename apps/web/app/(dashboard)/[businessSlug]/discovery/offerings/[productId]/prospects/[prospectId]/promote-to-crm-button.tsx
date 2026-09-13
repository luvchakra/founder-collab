"use client";

import { useTransition } from "react";
import { Button } from "@cofounderai/core/ui/button";
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

type PromoteResult = { ok: true; data: { leadId: string; alreadyPromoted: boolean } } | { ok: false; error: string };

/**
 * CRM-03.1's "Promote to CRM" action. The confirmation dialog names exactly what
 * carries across (acceptance criterion: "user sees what data is being carried across")
 * -- ICP fit, buying signals and research aren't shown as copied text here since
 * they're carried by reference, not value (see the server action's own docstring), so
 * the dialog names the concepts instead of previewing stale values.
 */
export function PromoteToCrmButton({
  hasParty,
  promoteAction,
}: {
  hasParty: boolean;
  promoteAction: () => Promise<PromoteResult>;
}) {
  const [pending, startTransition] = useTransition();

  if (!hasParty) {
    return (
      <Button variant="outline" size="sm" disabled title="This prospect has no linked contact record yet">
        Promote to CRM
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          {pending ? "Promoting..." : "Promote to CRM"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Promote to CRM</AlertDialogTitle>
          <AlertDialogDescription>
            Creates a CRM lead for this contact. Its product interest, ICP fit, buying
            signals, and research stay linked back to this Discovery prospect rather
            than being copied -- the CRM lead always reflects the latest Discovery data.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await promoteAction();
                  if (result.ok) {
                    toast.success(result.data.alreadyPromoted ? "Already promoted to CRM." : "Promoted to CRM.");
                  } else if (result.error === "MODULE_NOT_LICENSED") {
                    toast.error("CRM module not licensed for this business.");
                  } else {
                    toast.error(result.error);
                  }
                })
              }
            >
              Promote
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
