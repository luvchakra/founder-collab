import { createClient } from "../../db/server";
import type { ChannelPerformanceRow } from "./types";

/** The backlog's own seven-channel comparison set -- a subset of `crm.source_channel`
 * (which also has `google`/`fsm`/`existing_customer`/`other`, not part of this story's
 * own list). */
const CHANNELS = ["discovery", "whatsapp", "instagram", "facebook", "website", "referral", "manual"] as const;

/**
 * CRM-14.6's "Channel Performance" -- five metrics per source channel, verbatim from
 * the backlog. Both `crm.lead.source` and `crm.opportunity.source` are already the
 * exact `crm.source_channel` enum this story wants to group by -- no new column, no
 * cross-module call. `revenue` sums `estimated_value` on won opportunities (the same
 * figure CRM-14.1's "Won value" KPI uses) -- "revenue where available" means CRM's own
 * opportunity value, not a per-channel join through FSM's invoices (CRM-14.5 already
 * covers aggregate CRM->FSM revenue; breaking that down per source channel too would be
 * a second cross-module aggregation this story's own metric list doesn't require).
 */
export async function getChannelPerformance(businessId: string): Promise<ChannelPerformanceRow[]> {
  const supabase = await createClient();
  const [leadsRes, opportunitiesRes] = await Promise.all([
    supabase.from("lead").select("source, status").eq("business_id", businessId),
    supabase.from("opportunity").select("source, status, estimated_value").eq("business_id", businessId),
  ]);
  if (leadsRes.error) throw leadsRes.error;
  if (opportunitiesRes.error) throw opportunitiesRes.error;

  return CHANNELS.map((channel) => {
    const leads = leadsRes.data.filter((l) => l.source === channel);
    const opportunities = opportunitiesRes.data.filter((o) => o.source === channel);
    const wins = opportunities.filter((o) => o.status === "won");
    return {
      channel,
      // "Responded" -- moved past 'new' without being marked unresponsive.
      responded: leads.filter((l) => l.status !== "new" && l.status !== "unresponsive").length,
      qualifiedLeads: leads.filter((l) => l.status === "qualified").length,
      opportunities: opportunities.length,
      wins: wins.length,
      revenue: wins.reduce((sum, o) => sum + (o.estimated_value ?? 0), 0),
    };
  });
}
