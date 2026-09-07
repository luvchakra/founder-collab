import { createAdminClient } from "../db/admin";
import { getEventHandler } from "./registry";
import type { DomainEvent } from "./types";

function coreAdmin() {
  return createAdminClient({ schema: "core" });
}

/**
 * Drains up to `limit` due domain events (status='pending', next_attempt_at <= now()) --
 * runs with the admin client since a cron invocation has no signed-in user. For each
 * event: an unlicensed `required_module` parks it (no attempts penalty); no registered
 * handler for the event's type fails it permanently (nothing will fix that by
 * retrying); a handler that throws gets a retry with exponential backoff, up to
 * `max_attempts`, via core.record_domain_event_attempt() (D-9) -- this function only
 * decides the outcome, the SQL function is what atomically records it.
 *
 * Call this from apps/web/app/api/cron/drain-events/route.ts on a schedule.
 */
export async function drainDomainEvents(limit = 20): Promise<{ processed: number; parked: number; failed: number }> {
  const supabase = coreAdmin();
  const { data: events, error } = await supabase
    .from("domain_events")
    .select("*")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("published_at")
    .limit(limit);
  if (error) throw error;

  let processed = 0;
  let parked = 0;
  let failed = 0;

  for (const event of (events ?? []) as DomainEvent[]) {
    if (event.required_module) {
      const { data: licensed, error: licenseError } = await supabase.rpc("has_module", {
        p_business_id: event.business_id,
        p_key: event.required_module,
      });
      if (licenseError) throw licenseError;
      if (!licensed) {
        await recordAttempt(supabase, event.id, "parked");
        parked++;
        continue;
      }
    }

    const handler = getEventHandler(event.type);
    if (!handler) {
      await recordAttempt(supabase, event.id, "failed_permanent", `No handler registered for event type "${event.type}".`);
      failed++;
      continue;
    }

    try {
      await handler(event);
      await recordAttempt(supabase, event.id, "processed");
      processed++;
    } catch (err) {
      await recordAttempt(supabase, event.id, "failed_retry", err instanceof Error ? err.message : String(err));
      failed++;
    }
  }

  return { processed, parked, failed };
}

async function recordAttempt(
  supabase: ReturnType<typeof coreAdmin>,
  eventId: string,
  outcome: "processed" | "parked" | "failed_retry" | "failed_permanent",
  error?: string,
): Promise<void> {
  const { error: rpcError } = await supabase.rpc("record_domain_event_attempt", {
    p_event_id: eventId,
    p_outcome: outcome,
    p_error: error ?? null,
  });
  if (rpcError) throw rpcError;
}

/** Un-parks every event a business had waiting on `moduleKey` -- called from
 * activateLicense() (C-4) once the license actually activates, so a park caused by
 * "not licensed yet" doesn't wait for the next scheduled drain to notice the license
 * changed; the very next drain run picks these back up immediately either way. */
export async function replayParkedEvents(businessId: string, moduleKey: string): Promise<number> {
  const supabase = coreAdmin();
  const { data, error } = await supabase.rpc("replay_parked_events", {
    p_business_id: businessId,
    p_module: moduleKey,
  });
  if (error) throw error;
  return data as number;
}
