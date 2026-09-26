import { cache } from "react";
import { createClient } from "../../db/server";
import { getProspect } from "../prospects/queries";
import { listSignalsForProspect } from "../signals/queries";
import type { WatchlistEntry, WatchlistEntryWithProspect } from "./types";

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

/**
 * Enriches each stored entry with the account's own live "current score" (the
 * prospect's `fit_score`, the same value the rest of Discovery already treats as a
 * prospect's authoritative score -- see `discovery-criteria.ts`'s own candidate shape)
 * and "last signal" (the most recently observed `discovery.signals` row for that
 * prospect, if any). Neither is stored on the watchlist entry itself -- see the
 * migration's own comment on why a static copy would go stale.
 */
export async function getWatchlistDashboardRows(workspaceId: string): Promise<WatchlistEntryWithProspect[]> {
  const entries = await listWatchlistEntries(workspaceId);

  const rows = await Promise.all(
    entries.map(async (entry): Promise<WatchlistEntryWithProspect | null> => {
      const prospect = await getProspect(entry.prospect_id);
      if (!prospect) return null;

      const signals = await listSignalsForProspect(entry.prospect_id);
      const lastSignal = signals[0] ?? null;

      return {
        ...entry,
        prospectCompanyName: prospect.company_name,
        prospectIndustry: prospect.industry,
        currentScore: prospect.fit_score,
        lastSignalDescription: lastSignal?.description ?? null,
        lastSignalAt: lastSignal?.observed_at ?? null,
      };
    }),
  );

  return rows.filter((row): row is WatchlistEntryWithProspect => row !== null);
}
