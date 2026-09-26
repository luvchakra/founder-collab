import { createClient } from "../../db/server";
import type { PerformanceAnalysisRawData } from "./analysis";

/**
 * One round trip per table, all filtered by `workspace_id` directly (every table
 * involved carries it -- `signals`/`conversations`/`contacts` all do, confirmed against
 * their own migrations) rather than looping per-prospect the way per-prospect list
 * queries elsewhere in this module do -- this report needs every row in the workspace at
 * once, so a workspace-scoped query is the actual simplest implementation here, not a
 * `Promise.all` over `listSignalsForProspect` etc. for every prospect.
 */
export async function getPerformanceAnalysisRawData(workspaceId: string): Promise<PerformanceAnalysisRawData> {
  const supabase = await createClient();
  const [prospectsRes, signalsRes, conversationsRes, contactsRes, definitionsRes, opportunitiesRes] = await Promise.all([
    supabase.from("prospects").select("id, industry, location, fit_score, outcome").eq("workspace_id", workspaceId),
    supabase.from("signals").select("prospect_id, description").eq("workspace_id", workspaceId),
    supabase.from("conversations").select("prospect_id, contact_id, status").eq("workspace_id", workspaceId),
    supabase.from("contacts").select("id, job_title").eq("workspace_id", workspaceId),
    // DISC-OFFER-P1-02.3: the play behind each opportunity's definition.
    supabase.from("discovery_definitions").select("id, play_key").eq("workspace_id", workspaceId),
    supabase.from("opportunities").select("prospect_id, discovery_definition_id").eq("workspace_id", workspaceId),
  ]);
  if (prospectsRes.error) throw prospectsRes.error;
  if (signalsRes.error) throw signalsRes.error;
  if (conversationsRes.error) throw conversationsRes.error;
  if (contactsRes.error) throw contactsRes.error;
  if (definitionsRes.error) throw definitionsRes.error;
  if (opportunitiesRes.error) throw opportunitiesRes.error;

  return {
    prospects: prospectsRes.data,
    signals: signalsRes.data,
    conversations: conversationsRes.data,
    contacts: contactsRes.data,
    definitions: definitionsRes.data,
    opportunities: opportunitiesRes.data,
  };
}
