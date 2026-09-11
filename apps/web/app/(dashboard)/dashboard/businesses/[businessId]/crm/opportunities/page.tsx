import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { ensureDefaultStages } from "@cofounderai/module-crm/lib/opportunities/mutations";
import { listOpportunities } from "@cofounderai/module-crm/lib/opportunities/queries";
import { listPartiesForBusiness } from "@cofounderai/core/parties/queries";
import { formatDate } from "@cofounderai/core/lib/format";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { Target } from "lucide-react";
import { updateOpportunityStageAction } from "./actions";
import { OpportunitiesKanban } from "./opportunities-kanban";

/**
 * CRM-04.2's Opportunity Pipeline -- Kanban (default) and List views of the same data,
 * toggled via `?view=`, same href-toggle pattern module-fsm's own schedule page already
 * uses for its day/week views. Stage configuration (`ensureDefaultStages`) is
 * business-level and lazily provisioned on first visit. List view follows
 * docs/design/claude-ui-design-rules.md the same way the Leads page does: a real table
 * on desktop, cards below `md`.
 */
export default async function CrmOpportunitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { businessId } = await params;
  const { view } = await searchParams;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [stages, opportunities, parties] = await Promise.all([
    ensureDefaultStages(businessId),
    listOpportunities(businessId),
    listPartiesForBusiness(businessId),
  ]);
  const partyNameById = new Map(parties.map((p) => [p.id, p.name]));
  const stageNameById = new Map(stages.map((s) => [s.id, s.name]));

  const isListView = view === "list";
  const basePath = `/dashboard/businesses/${businessId}/crm/opportunities`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Opportunities</h1>
          <p className="mt-1 text-sm text-muted-foreground">{business.name}&apos;s pipeline of open deals.</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border p-1">
          <Button asChild variant={!isListView ? "secondary" : "ghost"} size="sm">
            <Link href={basePath}>Kanban</Link>
          </Button>
          <Button asChild variant={isListView ? "secondary" : "ghost"} size="sm">
            <Link href={`${basePath}?view=list`}>List</Link>
          </Button>
        </div>
      </div>

      {opportunities.length === 0 ? (
        <EmptyState icon={Target} message="No opportunities yet. Convert a lead to create one." />
      ) : isListView ? (
        <div className="rounded-2xl border border-border">
          <ul className="divide-y md:hidden">
            {opportunities.map((opportunity) => (
              <li key={opportunity.id} className="flex flex-col gap-2 p-3 text-sm">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <Link href={`/dashboard/businesses/${businessId}/crm/customers/${opportunity.party_id}`} className="min-w-0 font-medium break-words hover:underline">
                    {partyNameById.get(opportunity.party_id) ?? "Unknown contact"}
                  </Link>
                  <Badge variant={opportunity.status === "won" ? "secondary" : opportunity.status === "lost" ? "destructive" : "outline"} className="shrink-0">
                    {opportunity.stage_id ? stageNameById.get(opportunity.stage_id) : opportunity.status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Created {formatDate(opportunity.created_at)}</p>
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {opportunities.map((opportunity) => (
                <TableRow key={opportunity.id}>
                  <TableCell className="font-medium">
                    <Link href={`/dashboard/businesses/${businessId}/crm/customers/${opportunity.party_id}`} className="hover:underline">
                      {partyNameById.get(opportunity.party_id) ?? "Unknown contact"}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={opportunity.status === "won" ? "secondary" : opportunity.status === "lost" ? "destructive" : "outline"}>
                      {opportunity.stage_id ? stageNameById.get(opportunity.stage_id) : opportunity.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{opportunity.source}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatDate(opportunity.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <OpportunitiesKanban
          businessId={businessId}
          stages={stages}
          opportunities={opportunities}
          partyNameById={partyNameById}
          stageChangeAction={(opportunityId, stageId) => updateOpportunityStageAction(businessId, opportunityId, stageId)}
        />
      )}
    </div>
  );
}
