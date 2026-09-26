import { createClient } from "../../db/server";
import type { WatchlistEntry } from "./types";

export type WatchlistEntryInput = {
  watchReason: string;
  nextReviewAt: string | null;
};

/**
 * Upsert on `(workspace_id, prospect_id)` -- re-watching an already-watched account
 * edits the existing entry's reason/next-review rather than erroring or duplicating
 * (the migration's own unique constraint is what this relies on).
 */
export async function addToWatchlist(workspaceId: string, prospectId: string, input: WatchlistEntryInput): Promise<WatchlistEntry> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("watchlist_entries")
    .upsert(
      {
        workspace_id: workspaceId,
        prospect_id: prospectId,
        watch_reason: input.watchReason,
        next_review_at: input.nextReviewAt,
      },
      { onConflict: "workspace_id,prospect_id" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateWatchlistEntry(entryId: string, input: WatchlistEntryInput): Promise<WatchlistEntry> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("watchlist_entries")
    .update({ watch_reason: input.watchReason, next_review_at: input.nextReviewAt })
    .eq("id", entryId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeFromWatchlist(entryId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("watchlist_entries").delete().eq("id", entryId);
  if (error) throw error;
}
