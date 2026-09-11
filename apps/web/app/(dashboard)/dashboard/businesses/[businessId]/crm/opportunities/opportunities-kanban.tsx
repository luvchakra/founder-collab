"use client";

import { useTransition, type DragEvent } from "react";
import Link from "next/link";
import { toast } from "@cofounderai/core/ui/sonner";
import type { Opportunity, OpportunityStage } from "@cofounderai/module-crm/lib/opportunities/types";

/**
 * CRM-04.2's Kanban view -- native HTML5 drag-and-drop (no new dependency, CLAUDE.md
 * principle #2), same pattern module-fsm's own schedule-calendar.tsx already uses for
 * its own drag-to-reschedule gesture. One column per `crm.opportunity_stage`, sorted by
 * `sort_order`; dropping a card on a different column calls the stage-change action,
 * which is the one place auditing/events happen (this component only handles the drag
 * gesture itself).
 */
export function OpportunitiesKanban({
  businessId,
  stages,
  opportunities,
  partyNameById,
  stageChangeAction,
}: {
  businessId: string;
  stages: OpportunityStage[];
  opportunities: Opportunity[];
  partyNameById: Map<string, string>;
  stageChangeAction: (opportunityId: string, stageId: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  const onDragStart = (e: DragEvent, opportunityId: string) => {
    e.dataTransfer.setData("application/x-opportunity-id", opportunityId);
  };

  const onDrop = (e: DragEvent, stageId: string) => {
    e.preventDefault();
    const opportunityId = e.dataTransfer.getData("application/x-opportunity-id");
    const opportunity = opportunities.find((o) => o.id === opportunityId);
    if (!opportunity || opportunity.stage_id === stageId) return;
    startTransition(async () => {
      try {
        await stageChangeAction(opportunityId, stageId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not move the opportunity.");
      }
    });
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {stages.map((stage) => {
        const stageOpportunities = opportunities.filter((o) => o.stage_id === stage.id);
        return (
          <div
            key={stage.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDrop(e, stage.id)}
            className="flex w-64 shrink-0 flex-col gap-2 rounded-2xl border border-border bg-muted/30 p-2"
          >
            <div className="flex items-center justify-between px-1 text-xs font-semibold text-muted-foreground uppercase">
              <span>{stage.name}</span>
              <span>{stageOpportunities.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {stageOpportunities.map((opportunity) => (
                <Link
                  key={opportunity.id}
                  href={`/dashboard/businesses/${businessId}/crm/customers/${opportunity.party_id}`}
                  draggable
                  onDragStart={(e) => onDragStart(e, opportunity.id)}
                  className="rounded-md border border-border bg-card p-2 text-sm hover:border-primary/40"
                  aria-disabled={pending}
                >
                  {partyNameById.get(opportunity.party_id) ?? "Unknown contact"}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
