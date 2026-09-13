"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@cofounderai/core/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@cofounderai/core/ui/dropdown-menu";
import { toast } from "@cofounderai/core/ui/sonner";
import type { OpportunityStatus } from "../../lib/opportunities/types";

type ActionResult = { error: string } | { success: true };

/**
 * DISC-OFFER-P1-05.3: "Editable Stage Rows" -- the doc's own desktop row
 * (`Company | Score | Signal | Contact | [Edit] [•••]`) and menu (`Edit / Research Again
 * / Exclude / Watch / Send to CRM`). One "•••" menu per row, the same convention
 * `OfferingRowActions` (DISC-OFFER-P0-01.3) already established for this platform's own
 * row-action shape, plus a dedicated always-visible "Edit" link the doc's own mockup
 * shows separately from the menu (also repeated inside the menu, matching the doc's own
 * literal layout rather than picking one or the other).
 *
 * "Do not force users through a separate detail screen for simple row edits" is
 * satisfied for exactly the two edits this table can make safely without it: setting
 * status to Watching or Dismissed (`setOpportunityStatusAction`, a plain status write
 * already used by the Opportunity Detail page's own form) and re-researching the
 * prospect (`researchAgainAction`). "Edit" and "Send to CRM" deliberately still link to
 * the detail page rather than being inlined here: "Edit" because the detail page is
 * where the richer controls (choosing *any* of the seven recommended actions, not just
 * Watch/Exclude) already live, and "Send to CRM" because that page's own
 * `SendToCrmButton` runs a relationship check first (DISC-OFFER-P0-08.2) specifically to
 * avoid creating a duplicate CRM account -- reimplementing a second, unchecked "Send to
 * CRM" here would risk exactly the "must NOT create duplicate accounts/opportunities"
 * this module's own automation-safety rules (§25) forbid. Flagged as a deliberate scope
 * boundary, not an oversight.
 */
export function OpportunityRowActions({
  companyName,
  status,
  detailHref,
  setStatusAction,
  researchAgainAction,
}: {
  companyName: string;
  status: OpportunityStatus;
  detailHref: string;
  setStatusAction: (status: OpportunityStatus) => Promise<ActionResult>;
  researchAgainAction: () => Promise<ActionResult>;
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

  return (
    <div className="flex items-center gap-1">
      <Link href={detailHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
        Edit
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={pending} aria-label={`More actions for ${companyName}`}>
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={detailHref}>Edit</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run(researchAgainAction, `Researching ${companyName} again...`)}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Research Again
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {status !== "watching" ? (
            <DropdownMenuItem onSelect={() => run(() => setStatusAction("watching"), `Watching ${companyName}.`)}>Watch</DropdownMenuItem>
          ) : null}
          {status !== "dismissed" ? (
            <DropdownMenuItem onSelect={() => run(() => setStatusAction("dismissed"), `Excluded ${companyName}.`)}>Exclude</DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href={detailHref}>Send to CRM</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
