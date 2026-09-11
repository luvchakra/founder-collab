import { createClient } from "../../db/server";
import { getProspectResearch } from "../research/queries";
import { correlateSignals } from "./correlation";
import { listSignalsForProspect } from "./queries";
import type { Signal, SignalCorrelation, SignalType } from "./types";

/**
 * Deterministic, no AI call of its own (CLAUDE.md dev principle #4/#5): materializes the
 * buying signals/recent events a prior `researchProspect()` run already extracted into
 * discrete, addressable `discovery.signals` rows a correlation can reference by id.
 * Upsert-only on `(prospect_id, signal_type, description)` -- a refreshed research pass
 * only ever adds signals it newly mentions, it never deletes or rewrites one it no
 * longer does, since a signal is a fact observed at a point in time, not a live summary
 * that goes stale (the same "never silently erase a previous result" discipline the
 * pipeline stories later in this backlog name explicitly, applied here a phase early
 * since this is the first place Discovery persists a signal as its own row at all).
 */
export async function syncSignalsFromResearch(workspaceId: string, prospectId: string): Promise<Signal[]> {
  const research = await getProspectResearch(prospectId);
  if (!research) return [];

  const candidates: { signal_type: SignalType; description: string }[] = [
    ...research.buying_signals.map((description) => ({ signal_type: "buying_signal" as const, description })),
    ...research.recent_events.map((description) => ({ signal_type: "recent_event" as const, description })),
  ].filter((candidate) => candidate.description.trim().length > 0);

  if (candidates.length > 0) {
    const supabase = await createClient();
    const { error } = await supabase.from("signals").upsert(
      candidates.map((candidate) => ({
        workspace_id: workspaceId,
        prospect_id: prospectId,
        signal_type: candidate.signal_type,
        description: candidate.description,
        source: "prospect_research",
        observed_at: research.researched_at,
      })),
      { onConflict: "prospect_id,signal_type,description", ignoreDuplicates: true },
    );
    if (error) throw error;
  }

  return listSignalsForProspect(prospectId);
}

/**
 * DISC-OFFER-P0-05.3: syncs, then correlates, then persists -- one call a caller (a
 * future re-score action, or 07.x's opportunity UI) can invoke without knowing the
 * sync/correlate/persist steps are separate. Returns null when there is nothing to
 * correlate (no research yet, or research found no signals) rather than writing an
 * empty/meaningless correlation row.
 */
export async function correlateSignalsForProspect(
  workspaceId: string,
  prospectId: string,
): Promise<SignalCorrelation | null> {
  await syncSignalsFromResearch(workspaceId, prospectId);
  const signals = await listSignalsForProspect(prospectId);
  const result = correlateSignals(signals);
  if (!result) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("signal_correlations")
    .insert({
      workspace_id: workspaceId,
      prospect_id: prospectId,
      signal_ids: result.signalIds,
      rationale: result.rationale,
      confidence: result.confidence,
      earliest_signal_at: result.earliestSignalAt,
      latest_signal_at: result.latestSignalAt,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
