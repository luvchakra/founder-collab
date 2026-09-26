import { cache } from "react";
import { createClient } from "../../db/server";
import { listProducts, listWorkspacesForProducts } from "../tenancy/queries";
import { computeWatchReviewState, findOtherOfferingWatches, sortWatchlistRows } from "./review";
import type { OtherOfferingWatch, WatchlistEntry, WatchlistEntryWithProspect } from "./types";

export const listWatchlistEntries = cache(async (workspaceId: string): Promise<WatchlistEntry[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("watchlist_entries")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
});

export const getWatchlistEntry = cache(async (entryId: string): Promise<WatchlistEntry | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("watchlist_entries").select("*").eq("id", entryId).maybeSingle();
  if (error) throw error;
  return data;
});

export const getWatchlistEntryForProspect = cache(async (prospectId: string): Promise<WatchlistEntry | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("watchlist_entries").select("*").eq("prospect_id", prospectId).maybeSingle();
  if (error) throw error;
  return data;
});

type WatchedProspect = { id: string; company_name: string; industry: string | null; domain: string | null; fit_score: number | null };

/**
 * DISC-OFFER-P1-01.3: enriches each stored entry with the account's own live "current
 * score" (the prospect's `fit_score`, the value the rest of Discovery already treats as
 * a prospect's authoritative score) and "last signal" (the most recently observed
 * `discovery.signals` row for that prospect, if any), plus where its next review stands.
 * Neither score nor signal is stored on the watchlist entry itself -- see the migration's
 * own comment on why a static copy would go stale.
 *
 * Three queries for the whole list (entries, their prospects, their signals) rather than
 * two per row. Rows come back in working order: overdue reviews first.
 */
export async function getWatchlistDashboardRows(workspaceId: string, now: Date = new Date()): Promise<WatchlistEntryWithProspect[]> {
  const entries = await listWatchlistEntries(workspaceId);
  if (entries.length === 0) return [];

  const prospectIds = entries.map((e) => e.prospect_id);
  const supabase = await createClient();
  const [prospectsRes, signalsRes] = await Promise.all([
    supabase.from("prospects").select("id, company_name, industry, domain, fit_score").in("id", prospectIds),
    supabase
      .from("signals")
      .select("prospect_id, description, observed_at")
      .in("prospect_id", prospectIds)
      .order("observed_at", { ascending: false }),
  ]);
  if (prospectsRes.error) throw prospectsRes.error;
  if (signalsRes.error) throw signalsRes.error;

  const prospectById = new Map((prospectsRes.data as WatchedProspect[]).map((p) => [p.id, p] as const));
  const lastSignalByProspectId = new Map<string, { description: string; observed_at: string }>();
  for (const signal of signalsRes.data as { prospect_id: string; description: string; observed_at: string }[]) {
    if (!lastSignalByProspectId.has(signal.prospect_id)) lastSignalByProspectId.set(signal.prospect_id, signal);
  }

  const rows = entries.flatMap((entry): WatchlistEntryWithProspect[] => {
    const prospect = prospectById.get(entry.prospect_id);
    if (!prospect) return [];
    const lastSignal = lastSignalByProspectId.get(entry.prospect_id) ?? null;
    return [
      {
        ...entry,
        prospectCompanyName: prospect.company_name,
        prospectIndustry: prospect.industry,
        prospectDomain: prospect.domain,
        currentScore: prospect.fit_score,
        lastSignalDescription: lastSignal?.description ?? null,
        lastSignalAt: lastSignal?.observed_at ?? null,
        reviewState: computeWatchReviewState(entry.next_review_at, now),
      },
    ];
  });

  return sortWatchlistRows(rows);
}

/**
 * DISC-OFFER-P1-01.3: for the accounts on one offering's watchlist, the watches the same
 * real account has under this business's other offerings (each with its own reason).
 * Reads only this business's own workspaces; RLS scopes every row regardless.
 */
export async function getOtherOfferingWatches(
  businessId: string,
  currentWorkspaceId: string,
  rows: Pick<WatchlistEntryWithProspect, "prospect_id" | "prospectCompanyName" | "prospectDomain">[],
): Promise<Map<string, OtherOfferingWatch[]>> {
  if (rows.length === 0) return new Map();
  const products = await listProducts(businessId);
  if (products.length < 2) return new Map();

  const workspaces = (await listWorkspacesForProducts(products.map((p) => p.id))).filter((w) => w.id !== currentWorkspaceId);
  if (workspaces.length === 0) return new Map();
  const productById = new Map(products.map((p) => [p.id, p] as const));
  const productByWorkspaceId = new Map(workspaces.map((w) => [w.id, productById.get(w.product_id)] as const));

  const supabase = await createClient();
  const { data: entries, error } = await supabase
    .from("watchlist_entries")
    .select("workspace_id, prospect_id, watch_reason")
    .in(
      "workspace_id",
      workspaces.map((w) => w.id),
    );
  if (error) throw error;
  const otherEntries = entries as { workspace_id: string; prospect_id: string; watch_reason: string }[];
  if (otherEntries.length === 0) return new Map();

  const { data: prospects, error: prospectsError } = await supabase
    .from("prospects")
    .select("id, company_name, domain")
    .in(
      "id",
      otherEntries.map((e) => e.prospect_id),
    );
  if (prospectsError) throw prospectsError;
  const prospectById = new Map((prospects as { id: string; company_name: string; domain: string | null }[]).map((p) => [p.id, p] as const));

  const elsewhere = otherEntries.flatMap((entry) => {
    const prospect = prospectById.get(entry.prospect_id);
    const product = productByWorkspaceId.get(entry.workspace_id);
    if (!prospect || !product) return [];
    return [{ productId: product.id, productName: product.name, companyName: prospect.company_name, domain: prospect.domain, watchReason: entry.watch_reason }];
  });

  return findOtherOfferingWatches(
    rows.map((r) => ({ prospectId: r.prospect_id, companyName: r.prospectCompanyName, domain: r.prospectDomain })),
    elsewhere,
  );
}
