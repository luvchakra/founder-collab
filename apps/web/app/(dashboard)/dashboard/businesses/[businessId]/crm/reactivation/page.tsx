import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { listReactivationOpportunities } from "@cofounderai/module-crm/lib/reactivation/queries";
import { REACTIVATION_REASON_LABEL } from "@cofounderai/module-crm/lib/reactivation/types";
import { Badge } from "@cofounderai/core/ui/badge";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { RefreshCw } from "lucide-react";

/**
 * CRM-12.7's "Reactivation Opportunities" -- four signals (verbatim from the backlog):
 * a previously active customer gone quiet, an old lead with a fresh signal, a restocked
 * item someone was waiting on, and a completed service plausibly due again.
 * `listReactivationOpportunities()` (`lib/reactivation/queries.ts`) computes all four
 * live on every page load, deterministically (no AI call -- "detect" here means real
 * rule-based conditions over existing data, same discipline CRM-12.5's Buying Intent
 * Score already established). "Create a suggested action rather than an automatic
 * campaign": each row is read-only text plus a link to the customer -- nothing here
 * sends a message or creates a record on its own; a founder decides and acts from the
 * customer's own page.
 */
export default async function CrmReactivationPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const opportunities = await listReactivationOpportunities(businessId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Reactivation</h1>
        <p className="mt-1 text-sm text-muted-foreground">{business.name}&apos;s customers worth reaching out to again.</p>
      </div>

      {opportunities.length === 0 ? (
        <EmptyState icon={RefreshCw} message="No reactivation opportunities right now." />
      ) : (
        <div className="flex flex-col divide-y rounded-2xl border border-border">
          {opportunities.map((o, i) => (
            <Link
              key={`${o.partyId}-${o.reason}-${i}`}
              href={`/dashboard/businesses/${businessId}/crm/customers/${o.partyId}`}
              className="flex flex-col gap-1 p-3 text-sm hover:bg-muted/50"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{o.partyName}</span>
                <Badge variant="outline">{REACTIVATION_REASON_LABEL[o.reason]}</Badge>
              </div>
              <p className="text-muted-foreground">{o.detail}</p>
              <p className="text-xs font-medium text-primary">Suggested: {o.suggestedAction}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
