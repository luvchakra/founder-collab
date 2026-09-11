import { getCrmQuoteFunnelCounts } from "@cofounderai/module-fsm/contract/index";
import { createClient } from "../../db/server";
import type { CrmFsmFunnel } from "./types";

/**
 * CRM-14.5's "CRM -> FSM Funnel": `opportunity -> quote -> accepted -> job ->
 * completed -> revenue`. `opportunity`/`quote` are plain counts off `crm.opportunity`
 * (`fsm_opportunity_id is not null` is CRM-11.1's own bridge column, already on this
 * table -- no cross-module call needed to know whether a quote exists). The remaining
 * four come from `getCrmQuoteFunnelCounts()`, module-fsm's own contract -- see that
 * function's doc comment for why `accepted`/`job` are the same count. Returns `null`
 * (the whole section omitted, ADR-10) when FSM isn't licensed for this business.
 */
export async function getCrmFsmFunnel(businessId: string): Promise<CrmFsmFunnel | null> {
  const supabase = await createClient();
  const { data: opportunities, error } = await supabase
    .from("opportunity")
    .select("fsm_opportunity_id")
    .eq("business_id", businessId);
  if (error) throw error;

  const fsmResult = await getCrmQuoteFunnelCounts(businessId);
  if (!fsmResult.ok) return null;

  return {
    opportunity: opportunities.length,
    quote: opportunities.filter((o) => o.fsm_opportunity_id !== null).length,
    accepted: fsmResult.data.accepted,
    job: fsmResult.data.job,
    completed: fsmResult.data.completed,
    revenue: fsmResult.data.revenue,
  };
}
