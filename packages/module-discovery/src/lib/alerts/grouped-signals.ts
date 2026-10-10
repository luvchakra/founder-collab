import { createClient } from "../../db/server";
import type { AccountWorkspaceEntry } from "../dashboard/queries";
import type { Alert } from "./derive";

/**
 * DISC-OFFER-P1-01.4 ("Grouped Opportunity Alerts"): one alert per account whose recent
 * signals line up, not one per raw signal -- "Acme is heating up: New CTO + Hiring IAM
 * engineers + Cloud migration". Built from discovery.signal_correlations, which already
 * groups a prospect's signals (lib/signals/correlation.ts writes the "a + b + c"
 * rationale), so this adds no table and no AI call. Shown in the bell alongside every
 * other derived alert (app/(dashboard)/layout.tsx), recomputed on each render.
 */

/** A group is worth an alert only while it is recent. */
export const GROUPED_SIGNAL_WINDOW_DAYS = 14;

export type CorrelationForAlert = {
  id: string;
  workspace_id: string;
  prospect_id: string;
  signal_ids: string[];
  rationale: string;
  confidence: "low" | "medium" | "high";
  latest_signal_at: string;
};

/** Pure: the latest qualifying group per account -- two or more signals, the newest seen
 * inside the window -- as bell alerts linking to the account. */
export function buildGroupedSignalAlerts(
  correlations: CorrelationForAlert[],
  companyNames: Map<string, string>,
  entries: AccountWorkspaceEntry[],
  now: number = Date.now(),
): Alert[] {
  const byWorkspace = new Map(entries.map((e) => [e.workspace.id, e]));
  const cutoff = now - GROUPED_SIGNAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const latestPerProspect = new Map<string, CorrelationForAlert>();
  for (const c of correlations) {
    if (c.signal_ids.length < 2 || Date.parse(c.latest_signal_at) < cutoff) continue;
    const seen = latestPerProspect.get(c.prospect_id);
    if (!seen || Date.parse(c.latest_signal_at) > Date.parse(seen.latest_signal_at)) latestPerProspect.set(c.prospect_id, c);
  }

  const alerts: Alert[] = [];
  for (const c of latestPerProspect.values()) {
    const entry = byWorkspace.get(c.workspace_id);
    const company = companyNames.get(c.prospect_id);
    if (!entry || !company) continue;
    alerts.push({
      id: `signals-${c.id}`,
      severity: c.confidence === "high" ? "warning" : "info",
      message: `${company} is heating up (${entry.product.name}): ${c.rationale}`,
      href: `/${entry.business.slug}/discovery/offerings/${entry.product.id}/prospects/${c.prospect_id}`,
      businessId: entry.business.id,
    });
  }
  return alerts;
}

/** Reads recent groups through the signed-in user's own RLS (discovery licence and
 * discovery.view enforced by readable_workspace_ids()), so the bell only ever shows
 * accounts this user may see. */
export async function getGroupedSignalAlerts(entries: AccountWorkspaceEntry[]): Promise<Alert[]> {
  if (entries.length === 0) return [];
  const supabase = await createClient();
  const since = new Date(Date.now() - GROUPED_SIGNAL_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("signal_correlations")
    .select("id, workspace_id, prospect_id, signal_ids, rationale, confidence, latest_signal_at")
    .in("workspace_id", entries.map((e) => e.workspace.id))
    .gte("latest_signal_at", since);
  if (error) throw error;
  const correlations = (data ?? []) as CorrelationForAlert[];
  const prospectIds = [...new Set(correlations.filter((c) => c.signal_ids.length >= 2).map((c) => c.prospect_id))];
  if (prospectIds.length === 0) return [];
  const { data: prospects, error: prospectError } = await supabase.from("prospects").select("id, company_name").in("id", prospectIds);
  if (prospectError) throw prospectError;
  const names = new Map(((prospects ?? []) as { id: string; company_name: string }[]).map((p) => [p.id, p.company_name]));
  return buildGroupedSignalAlerts(correlations, names, entries);
}
