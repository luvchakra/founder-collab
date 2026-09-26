import { resolveBusinessSlugById } from "@cofounderai/core/businesses/resolve";
import { createClient } from "../../db/server";
import { listProducts, listWorkspacesForProducts } from "../tenancy/queries";
import type { Alert } from "./derive";

/**
 * DISC-OFFER-P1-01.4 "Grouped Opportunity Alerts": "do not create one alert per raw
 * signal" -- the signals an account picked up recently, for one offering, become ONE
 * alert ("Acme is heating up: New CTO + Hiring IAM engineers + Cloud migration").
 *
 * Derived, never stored, the same way every other Discovery alert is (`derive.ts`):
 * signals arrive whenever research runs -- a founder's own run, a rediscovery, a
 * re-research -- and the grouping is re-read from `discovery.signals` each time the bell
 * or the Signals page renders. The alert id carries the newest signal's id, so a group
 * that gains a signal reads as a new, unread alert while an unchanged one stays read.
 *
 * Deterministic, no AI call (CLAUDE.md dev principle 4): which signals belong together
 * is "same account, same offering, inside the window" -- nothing to judge.
 */

/** How far back a signal still counts as "recent". */
export const OPPORTUNITY_ALERT_WINDOW_DAYS = 14;
/** One signal is a fact, not a trend: an account "heats up" when two or more land. */
export const OPPORTUNITY_ALERT_MIN_SIGNALS = 2;
/** Signal descriptions shown in the one-line bell message; the rest are counted. */
const MESSAGE_SIGNAL_LIMIT = 3;
const MESSAGE_SIGNAL_MAX_CHARS = 60;

/** An account the founder already acted on for this offering: sent to CRM (CRM owns it
 * now) or dismissed (the founder said no). New signals there are not a prompt to act. */
const SETTLED_OPPORTUNITY_STATUSES = new Set(["sent_to_crm", "dismissed"]);

export type RecentSignal = {
  id: string;
  workspace_id: string;
  prospect_id: string;
  description: string;
  observed_at: string;
};

export type OpportunityAlertGroup = {
  /** Stable while the group is unchanged; changes when a newer signal joins it. */
  id: string;
  workspaceId: string;
  prospectId: string;
  companyName: string;
  /** Newest first. */
  signals: { id: string; description: string; observedAt: string }[];
  latestAt: string;
};

/**
 * Groups recent signals into one alert per (offering workspace, account). Pure: takes
 * rows already read and `now`. Groups come back newest-first, and within a group the
 * same description observed twice (a re-sync) counts once.
 */
export function groupOpportunityAlerts(input: {
  signals: RecentSignal[];
  companyNameByProspectId: Map<string, string>;
  settledProspectIds: Set<string>;
  now: Date;
  windowDays?: number;
  minSignals?: number;
}): OpportunityAlertGroup[] {
  const windowDays = input.windowDays ?? OPPORTUNITY_ALERT_WINDOW_DAYS;
  const minSignals = input.minSignals ?? OPPORTUNITY_ALERT_MIN_SIGNALS;
  const since = input.now.getTime() - windowDays * 86_400_000;

  const byAccount = new Map<string, RecentSignal[]>();
  for (const signal of input.signals) {
    const observed = new Date(signal.observed_at).getTime();
    if (Number.isNaN(observed) || observed < since) continue;
    if (input.settledProspectIds.has(signal.prospect_id)) continue;
    const key = `${signal.workspace_id}:${signal.prospect_id}`;
    const list = byAccount.get(key) ?? [];
    list.push(signal);
    byAccount.set(key, list);
  }

  const groups: OpportunityAlertGroup[] = [];
  for (const list of byAccount.values()) {
    const sorted = [...list].sort((a, b) => b.observed_at.localeCompare(a.observed_at) || a.id.localeCompare(b.id));
    const seen = new Set<string>();
    const distinct = sorted.filter((s) => {
      const key = s.description.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (distinct.length < minSignals) continue;

    const newest = distinct[0]!;
    const companyName = input.companyNameByProspectId.get(newest.prospect_id);
    if (!companyName) continue;
    groups.push({
      id: `opportunity-heating-${newest.prospect_id}-${newest.id}`,
      workspaceId: newest.workspace_id,
      prospectId: newest.prospect_id,
      companyName,
      signals: distinct.map((s) => ({ id: s.id, description: s.description, observedAt: s.observed_at })),
      latestAt: newest.observed_at,
    });
  }

  return groups.sort((a, b) => b.latestAt.localeCompare(a.latestAt) || b.signals.length - a.signals.length);
}

function shorten(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > MESSAGE_SIGNAL_MAX_CHARS ? `${clean.slice(0, MESSAGE_SIGNAL_MAX_CHARS - 1).trimEnd()}…` : clean;
}

/** The one-line form the bell shows: "Acme is heating up for Managed IAM: New CTO +
 * Hiring IAM engineers + Cloud migration (+2 more)". */
export function formatOpportunityAlertMessage(group: OpportunityAlertGroup, offeringName: string | null): string {
  const shown = group.signals.slice(0, MESSAGE_SIGNAL_LIMIT).map((s) => shorten(s.description));
  const more = group.signals.length - shown.length;
  const forOffering = offeringName ? ` for ${offeringName}` : "";
  return `${group.companyName} is heating up${forOffering}: ${shown.join(" + ")}${more > 0 ? ` (+${more} more)` : ""}`;
}

type OfferingRef = { productId: string; productName: string; workspaceId: string };

/** Reads what `groupOpportunityAlerts` needs for the given offering workspaces: the
 * window's signals, their accounts' names, and which accounts are already settled. */
async function loadOpportunityAlertGroups(workspaceIds: string[], now: Date): Promise<OpportunityAlertGroup[]> {
  if (workspaceIds.length === 0) return [];
  const supabase = await createClient();
  const since = new Date(now.getTime() - OPPORTUNITY_ALERT_WINDOW_DAYS * 86_400_000).toISOString();

  const { data: signals, error } = await supabase
    .from("signals")
    .select("id, workspace_id, prospect_id, description, observed_at")
    .in("workspace_id", workspaceIds)
    .gte("observed_at", since)
    .order("observed_at", { ascending: false });
  if (error) throw error;
  const recent = signals as RecentSignal[];
  if (recent.length === 0) return [];

  const prospectIds = [...new Set(recent.map((s) => s.prospect_id))];
  const [prospectsRes, opportunitiesRes] = await Promise.all([
    supabase.from("prospects").select("id, company_name").in("id", prospectIds),
    supabase.from("opportunities").select("prospect_id, status").in("prospect_id", prospectIds),
  ]);
  if (prospectsRes.error) throw prospectsRes.error;
  if (opportunitiesRes.error) throw opportunitiesRes.error;

  return groupOpportunityAlerts({
    signals: recent,
    companyNameByProspectId: new Map((prospectsRes.data as { id: string; company_name: string }[]).map((p) => [p.id, p.company_name] as const)),
    settledProspectIds: new Set(
      (opportunitiesRes.data as { prospect_id: string; status: string }[])
        .filter((o) => SETTLED_OPPORTUNITY_STATUSES.has(o.status))
        .map((o) => o.prospect_id),
    ),
    now,
  });
}

async function listOfferingRefs(businessId: string): Promise<OfferingRef[]> {
  const products = await listProducts(businessId);
  const workspaces = await listWorkspacesForProducts(products.map((p) => p.id));
  const productById = new Map(products.map((p) => [p.id, p] as const));
  return workspaces.flatMap((w) => {
    const product = productById.get(w.product_id);
    return product ? [{ productId: product.id, productName: product.name, workspaceId: w.id }] : [];
  });
}

/** DISC-OFFER-P1-01.4: one offering's grouped alerts, for its Signals page. */
export async function getOpportunityAlertGroupsForWorkspace(workspaceId: string, now: Date = new Date()): Promise<OpportunityAlertGroup[]> {
  return loadOpportunityAlertGroups([workspaceId], now);
}

/** DISC-OFFER-P1-01.4: every offering's grouped alerts for one business, as bell items --
 * one per heating-up account, linking to that account under its offering. */
export async function getGroupedOpportunityAlerts(businessId: string, now: Date = new Date()): Promise<Alert[]> {
  const offerings = await listOfferingRefs(businessId);
  if (offerings.length === 0) return [];
  const [groups, slug] = await Promise.all([
    loadOpportunityAlertGroups(
      offerings.map((o) => o.workspaceId),
      now,
    ),
    resolveBusinessSlugById(businessId),
  ]);
  if (!slug) return [];
  const offeringByWorkspaceId = new Map(offerings.map((o) => [o.workspaceId, o] as const));
  const showOffering = offerings.length > 1;

  return groups.flatMap((group) => {
    const offering = offeringByWorkspaceId.get(group.workspaceId);
    if (!offering) return [];
    return [
      {
        id: group.id,
        severity: "info" as const,
        message: formatOpportunityAlertMessage(group, showOffering ? offering.productName : null),
        href: `/${slug}/discovery/offerings/${offering.productId}/prospects/${group.prospectId}`,
        businessId,
      },
    ];
  });
}
