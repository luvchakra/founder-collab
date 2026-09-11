import { cache } from "react";
import { createClient } from "../../db/server";
import type { Signal, SignalCorrelation } from "./types";

/** cache()-wrapped for the same request-dedup reason every other list query in this
 * module is -- `correlateSignalsForProspect` (mutations.ts) reads this same list right
 * after syncing, so a render that already fetched a prospect's signals this request
 * doesn't pay for a second round trip. */
export const listSignalsForProspect = cache(async (prospectId: string): Promise<Signal[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("signals")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("observed_at", { ascending: false });
  if (error) throw error;
  return data;
});

export const listSignalCorrelationsForProspect = cache(
  async (prospectId: string): Promise<SignalCorrelation[]> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("signal_correlations")
      .select("*")
      .eq("prospect_id", prospectId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
);

/** DISC-OFFER-P0-07.2: "Top Signal" -- looks up the exact correlation an opportunity's
 * own `signal_correlation_id` (05.3) points to, rather than re-deriving "the latest
 * one" via `getLatestSignalCorrelation` -- an opportunity should show the correlation
 * that actually justified its own `signal_strength_score`, which may not be the most
 * recent one if a newer, weaker correlation has run since without being re-attached. */
export const getSignalCorrelation = cache(async (correlationId: string): Promise<SignalCorrelation | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("signal_correlations").select("*").eq("id", correlationId).maybeSingle();
  if (error) throw error;
  return data;
});

/** Latest correlation only -- "current" read for a prospect, most callers (e.g.
 * `attachSignalCorrelation`) want this, not the full history. */
export const getLatestSignalCorrelation = cache(
  async (prospectId: string): Promise<SignalCorrelation | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("signal_correlations")
      .select("*")
      .eq("prospect_id", prospectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
);
