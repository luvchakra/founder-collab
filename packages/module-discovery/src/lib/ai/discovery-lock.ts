import { createClient } from "../../db/server";

/**
 * discoverProspects has no persisted "input" to hash against (the ICP + known-companies
 * list it searches from shifts as prospects are added), so R1's input-hash dedup doesn't
 * apply -- this is an explicit in-flight lock instead, so two overlapping discovery runs
 * for the same workspace can't both bill (docs/ai-usage-cost-requirements.md R6).
 *
 * A lock older than this is treated as abandoned (e.g. a crashed request that never
 * released it) and can be taken over, rather than permanently wedging discovery for that
 * workspace.
 */
const STALE_LOCK_MS = 3 * 60 * 1000;

export class DiscoveryInProgressError extends Error {
  constructor() {
    super(
      "A prospect discovery search is already running for this workspace. Wait for it to finish before starting another.",
    );
    this.name = "DiscoveryInProgressError";
  }
}

export async function acquireDiscoveryLock(workspaceId: string): Promise<void> {
  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("prospect_discovery_locks")
    .select("started_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  if (existing) {
    const age = Date.now() - new Date(existing.started_at).getTime();
    if (age < STALE_LOCK_MS) throw new DiscoveryInProgressError();

    const { error: updateError } = await supabase
      .from("prospect_discovery_locks")
      .update({ started_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId);
    if (updateError) throw updateError;
    return;
  }

  const { error: insertError } = await supabase
    .from("prospect_discovery_locks")
    .insert({ workspace_id: workspaceId });
  if (insertError) {
    // Unique violation -- lost the race to a concurrent request.
    throw new DiscoveryInProgressError();
  }
}

export async function releaseDiscoveryLock(workspaceId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("prospect_discovery_locks").delete().eq("workspace_id", workspaceId);
}
