"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cofounderai/core/ui/dropdown-menu";
import {
  createLeadFromInteractionAction,
  createOpportunityFromInteractionAction,
  createTaskFromInteractionAction,
  markNotRelevantAction,
} from "./actions";

/**
 * CRM-09.5's exact action set from an unanswered message: `Respond | Create Lead |
 * Create Opportunity | Create Task | Not Relevant`. Grouped as one primary action
 * (Respond) plus a "Convert" dropdown for the three create actions -- five separate
 * outline buttons crammed into one row/cell was the opposite of docs/design/
 * claude-ui-design-rules.md rule 3 ("avoid ... excessive button counts"). `Not
 * Relevant` is set apart with its own icon-only button and extra spacing, per rule 4's
 * "destructive actions must be visually separated from routine ones" -- dismissing a
 * row out of the queue reads as the odd one out next to three ways of converting it.
 * `Create Lead`/`Create Opportunity` only show when the sender is a known party
 * (`conversion-actions.ts`'s own "existing party is reused" -- an unmatched sender's
 * tier-5 party creation is CRM-06.4's own territory, not this one's); `Create Task`
 * and `Not Relevant` are always available.
 */
export function LostBusinessActionsRow({
  businessId,
  businessSlug,
  interactionId,
  conversationId,
  partyId,
}: {
  businessId: string;
  businessSlug: string;
  interactionId: string;
  conversationId: string;
  partyId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button asChild size="sm" variant="outline">
        <Link href={`/${businessSlug}/crm/conversations?conversationId=${conversationId}`}>Respond</Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={pending}>
            Convert
            <ChevronDown className="size-3.5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {partyId ? (
            <>
              <DropdownMenuItem onSelect={() => run(() => createLeadFromInteractionAction(businessId, interactionId))}>
                Create Lead
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => run(() => createOpportunityFromInteractionAction(businessId, interactionId))}>
                Create Opportunity
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuItem onSelect={() => run(() => createTaskFromInteractionAction(businessId, interactionId))}>
            Create Task
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        className="ml-1 text-muted-foreground hover:text-destructive"
        aria-label="Not relevant"
        title="Not relevant"
        onClick={() => run(() => markNotRelevantAction(businessId, interactionId))}
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
