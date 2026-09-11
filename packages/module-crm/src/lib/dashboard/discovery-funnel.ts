import { getProspectFunnelCounts } from "@cofounderai/module-discovery/contract/index";
import { createClient } from "../../db/server";
import type { DiscoveryCrmFunnel } from "./types";

/**
 * CRM-14.4's "Discovery -> CRM Funnel": `discovered -> contacted -> engaged ->
 * qualified -> opportunity -> won`. The first four stages come from Discovery's own
 * contract (`getProspectFunnelCounts()`); the last two are CRM's own leads/opportunities
 * -- `crm.lead.source_module = 'discovery'` is CRM-03.1's own traceability field
 * (`promoteProspectToLead()`), and `crm.opportunity.lead_id` is how a promoted lead's
 * eventual opportunity is found (CRM-03.4's lead->opportunity conversion). Returns
 * `null` when Discovery isn't licensed (ADR-10 degraded mode) -- the caller simply
 * omits this section rather than rendering six zeros.
 */
export async function getDiscoveryCrmFunnel(businessId: string): Promise<DiscoveryCrmFunnel | null> {
  const discoveryResult = await getProspectFunnelCounts(businessId);
  if (!discoveryResult.ok) return null;

  const supabase = await createClient();
  const { data: discoveryLeads, error: leadsError } = await supabase
    .from("lead")
    .select("id")
    .eq("business_id", businessId)
    .eq("source_module", "discovery");
  if (leadsError) throw leadsError;

  const leadIds = (discoveryLeads ?? []).map((l) => l.id);
  let opportunity = 0;
  let won = 0;
  if (leadIds.length > 0) {
    const { data: opportunities, error: opportunitiesError } = await supabase
      .from("opportunity")
      .select("status")
      .eq("business_id", businessId)
      .in("lead_id", leadIds);
    if (opportunitiesError) throw opportunitiesError;
    opportunity = opportunities.length;
    won = opportunities.filter((o) => o.status === "won").length;
  }

  return {
    discovered: discoveryResult.data.discovered,
    contacted: discoveryResult.data.contacted,
    engaged: discoveryResult.data.engaged,
    qualified: discoveryResult.data.qualified,
    opportunity,
    won,
  };
}
