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

/** Structurally mirrors module-crm's own `RelationshipMatch` (DISC-OFFER-P0-08.2) --
 * declared locally rather than imported, the same "no cross-module internals import"
 * rule (CLAUDE.md architecture rule #3) `PromoteResult` above already respects for its
 * own shape; `apps/web` (exempt from that rule) is the one place these two independent
 * declarations get bridged together. `null` means the check couldn't run (CRM not
 * licensed, or nothing to check yet) -- shown as no warning at all, not an error. */
export type RelationshipMatch = {
  status: "new_prospect" | "existing_lead" | "existing_customer" | "existing_opportunity" | "existing_contact" | "potential_duplicate";
  matchedPartyName: string | null;
  detail: string | null;
};

const RELATIONSHIP_STATUS_LABEL: Record<RelationshipMatch["status"], string> = {
  new_prospect: "New Prospect",
  existing_lead: "Existing Lead",
  existing_customer: "Existing Customer",
  existing_opportunity: "Existing CRM Opportunity",
  existing_contact: "Existing Contact",
  potential_duplicate: "Potential Duplicate",
};

/**
 * DISC-OFFER-P0-08.1: the opportunity-aware sibling of the prospect page's own
 * `PromoteToCrmButton` (CRM-03.1, `apps/web/.../prospects/[prospectId]/`) -- same
 * by-reference philosophy, same confirmation-dialog pattern, but framed around this
 * specific opportunity (its score/why-them/why-now/research-brief/recommended-action
 * already flow to CRM live -- see `module-discovery/contract/index.ts`'s own
 * `ContractOpportunitySummary` addition this same story) and, on success, also marks
 * this opportunity `sent_to_crm` rather than leaving that to a bare status picker. Kept
 * as its own small component (not a shared import of the prospect-page button) since
 * that one is `apps/web`-local and takes a differently-shaped action; duplicating ~60
 * lines here was simpler than relocating an already-working, unrelated file.
 */
export function SendToCrmButton({
  hasParty,
  relationship,
  sendAction,
}: {
  hasParty: boolean;
  /** DISC-OFFER-P0-08.2's own "before handoff classify" check -- shown in the
   * confirmation dialog so a founder sees it before creating a possibly-duplicate CRM
   * relationship, never blocked automatically (this platform never silently decides on
   * a human's behalf -- see the contract function's own doc comment). */
  relationship: RelationshipMatch | null;
  sendAction: () => Promise<PromoteResult>;
}) {
  const [pending, startTransition] = useTransition();

  if (!hasParty) {
    return (
      <Button variant="outline" size="sm" disabled title="This prospect has no linked contact record yet">
        Send to CRM
      </Button>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" disabled={pending}>
          {pending ? "Sending..." : "Send to CRM"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send to CRM</AlertDialogTitle>
          <AlertDialogDescription>
            Creates a CRM lead for this account. Its score, why-them, why-now, research
            brief, recommended action, and originating discovery definition stay linked
            back to this opportunity rather than being copied -- the CRM lead always
            reflects the latest Discovery data. This opportunity will be marked
            &quot;Sent to CRM.&quot;
          </AlertDialogDescription>
        </AlertDialogHeader>
        {relationship && relationship.status !== "new_prospect" ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">{RELATIONSHIP_STATUS_LABEL[relationship.status]}</p>
            {relationship.detail ? <p className="mt-1">{relationship.detail}</p> : null}
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await sendAction();
                  if (result.ok) {
                    toast.success(result.data.alreadyPromoted ? "Already sent to CRM." : "Sent to CRM.");
                  } else if (result.error === "MODULE_NOT_LICENSED") {
                    toast.error("CRM module not licensed for this business.");
                  } else {
                    toast.error(result.error);
                  }
                })
              }
            >
              Send
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
