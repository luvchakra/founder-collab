"use client";

import { useTransition } from "react";
import Link from "next/link";
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

const OPPORTUNITY_STATUS_LABEL: Record<string, string> = {
  new: "New",
  estimate_scheduled: "Estimate scheduled",
  estimate_sent: "Estimate sent",
  won: "Won",
  lost: "Lost",
};

type HandoffState =
  | { kind: "not_licensed" }
  | { kind: "missing" }
  | { kind: "exists"; opportunityId: string; opportunityStatus: string };

/**
 * The Conversions page's per-customer action -- three states, one per branch of
 * `getHandoffStatusForProspect`'s own `ContractResult` (see that contract function's
 * docstring in module-fsm for the full reasoning): `fsm` not licensed at all shows a
 * message prompting a purchase instead of a working button (never a silent no-op);
 * licensed with no opportunity yet shows a real "Create opportunity" action; an
 * opportunity that already exists (created either by this same button earlier, or by
 * the automatic `prospect.won` event handoff) shows a link to it instead of offering to
 * create a second one.
 */
export function CreateOpportunityButton({
  state,
  businessId,
  createAction,
}: {
  state: HandoffState;
  businessId: string;
  createAction: () => Promise<{ ok: true; data: { opportunityId: string } } | { ok: false; error: string }>;
}) {
  const [pending, startTransition] = useTransition();

  if (state.kind === "exists") {
    return (
      <Link
        href={`/dashboard/businesses/${businessId}/fsm/opportunities/${state.opportunityId}`}
        className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:underline"
      >
        Opportunity: {OPPORTUNITY_STATUS_LABEL[state.opportunityStatus] ?? state.opportunityStatus}
      </Link>
    );
  }

  if (state.kind === "not_licensed") {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm">
            Create opportunity
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Service module not licensed</AlertDialogTitle>
            <AlertDialogDescription>
              Creating an opportunity from a won deal requires the Service module. Purchase it
              for this business to hand won deals off to field service automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Link href="/dashboard/settings/licenses">Go to licenses</Link>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await createAction();
          if (result.ok) toast.success("Opportunity created.");
          else toast.error(result.error);
        })
      }
    >
      {pending ? "Creating..." : "Create opportunity"}
    </Button>
  );
}
