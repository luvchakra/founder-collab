import Link from "next/link";
import { Badge } from "@cofounderai/core/ui/badge";
import { OFFERING_STATUS_LABEL, OFFERING_TYPE_LABEL } from "../../lib/offerings/types";
import type { Offering } from "../../lib/offerings/types";
import { PERSONA_PRIORITY_LABEL, PERSONA_ROLE_LABEL } from "../../lib/personas/types";
import type { BuyerPersona } from "../../lib/personas/types";
import type { IcpProfile } from "../../lib/icp/types";
import type { ProspectCounts } from "../../lib/prospects/queries";

const ICP_LIST_FIELDS = [
  "industries",
  "company_sizes",
  "geographies",
  "roles",
  "pain_points",
  "buying_signals",
  "exclusions",
  "revenue",
  "business_model",
  "technology",
  "growth_stage",
  "existing_tools",
] as const;

function icpFieldsDefined(icp: IcpProfile): number {
  return ICP_LIST_FIELDS.filter((field) => icp[field].length > 0).length;
}

/**
 * DISC-OFFER-P0-03.2's "Offering Discovery Overview" -- "what should I do today for this
 * offering?" answered from data that genuinely exists today only. The backlog's own
 * suggested section list also includes Active Discovery Plays / Today's Opportunities /
 * Recent Signals / Watchlist / CRM Handoffs -- all deliberately left out here since none
 * of those entities exist yet (they're 04.2/05.x-07.x/P1/08.x's own stories); adding them
 * now would mean either fabricated numbers or empty placeholders, the same false-
 * precision problem already avoided in 01.3's offerings table. This card set grows as
 * those stories land, each adding its own real section rather than a stub.
 */
export function OfferingOverviewSummary({
  businessId,
  offering,
  icp,
  personas,
  prospectCounts,
}: {
  businessId: string;
  offering: Offering;
  icp: IcpProfile | null;
  personas: BuyerPersona[];
  prospectCounts: ProspectCounts;
}) {
  const basePath = `/dashboard/businesses/${businessId}/products/${offering.id}`;
  const icpFieldsCount = icp ? icpFieldsDefined(icp) : 0;

  const nextAction = !icp
    ? { label: "Define your ICP", href: `${basePath}/icp` }
    : icp.status === "draft"
      ? { label: "Review and approve your ICP", href: `${basePath}/icp` }
      : personas.length === 0
        ? { label: "Add buyer personas", href: `${basePath}/icp` }
        : prospectCounts.total === 0
          ? { label: "Discover prospects", href: `${basePath}/prospects` }
          : { label: "Review your prospects", href: `${basePath}/prospects` };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 rounded-lg border border-dashed border-border p-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">What should I do today?</p>
        <Link href={nextAction.href} className="text-sm font-medium text-primary hover:underline">
          {nextAction.label} &rarr;
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Offering</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{OFFERING_TYPE_LABEL[offering.offering_type ?? "other"]}</Badge>
            <Badge variant="outline">{OFFERING_STATUS_LABEL[offering.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{offering.category ?? "No category set"}</p>
        </div>

        <Link href={`${basePath}/icp`} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">ICP health</p>
          {icp ? (
            <>
              <div className="flex items-center gap-1.5">
                <Badge variant={icp.status === "approved" ? "default" : "secondary"}>{icp.status === "approved" ? "Approved" : "Draft"}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{icpFieldsCount} of {ICP_LIST_FIELDS.length} fields defined</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No ICP yet</p>
          )}
        </Link>

        <Link href={`${basePath}/prospects`} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Prospects</p>
          <p className="text-sm text-muted-foreground">
            {prospectCounts.total} total &middot; {prospectCounts.qualified} qualified &middot; {prospectCounts.new} new
          </p>
        </Link>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Buyer personas</p>
          <Link href={`${basePath}/icp`} className="text-xs font-medium text-primary hover:underline">
            Manage &rarr;
          </Link>
        </div>
        {personas.length === 0 ? (
          <p className="text-sm text-muted-foreground">No buyer personas yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {personas.map((persona) => (
              <Badge key={persona.id} variant="secondary" title={`${PERSONA_ROLE_LABEL[persona.role_in_committee]} • ${PERSONA_PRIORITY_LABEL[persona.priority]} priority`}>
                {persona.title}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
