import { createAdminClient } from "../db/admin";
import type { GatewayProvider, NormalizedGatewayEvent } from "./types";

/**
 * core.payment_gateway_events -- the webhook inbox. Both providers deliver
 * at-least-once and retry on any non-2xx, so every event is recorded once on
 * (provider, provider_event_id) before it's acted on:
 * - first delivery: inserted as 'received', then processed;
 * - redelivery of a processed/ignored event: acknowledged without reprocessing;
 * - redelivery of a failed/stuck one: reprocessed (attempts incremented).
 * Service-role only -- webhooks have no user session.
 */
function coreAdmin() {
  return createAdminClient({ schema: "core" });
}

export async function receiveGatewayEvent(input: {
  provider: GatewayProvider;
  scope: "platform" | "business";
  businessId: string | null;
  event: NormalizedGatewayEvent;
  payload: unknown;
}): Promise<{ id: string; alreadyHandled: boolean }> {
  const supabase = coreAdmin();
  const { data: inserted, error } = await supabase
    .from("payment_gateway_events")
    .upsert(
      {
        provider: input.provider,
        provider_event_id: input.event.eventId,
        scope: input.scope,
        business_id: input.businessId,
        event_type: input.event.eventType,
        payload: input.payload,
        attempts: 1,
      },
      { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw error;
  if (inserted && inserted.length > 0) return { id: inserted[0]!.id as string, alreadyHandled: false };

  const { data: existing, error: selectError } = await supabase
    .from("payment_gateway_events")
    .select("id, status, attempts")
    .eq("provider", input.provider)
    .eq("provider_event_id", input.event.eventId)
    .single();
  if (selectError) throw selectError;
  if (existing.status === "processed" || existing.status === "ignored") {
    return { id: existing.id, alreadyHandled: true };
  }
  await supabase
    .from("payment_gateway_events")
    .update({ attempts: (existing.attempts as number) + 1 })
    .eq("id", existing.id);
  return { id: existing.id, alreadyHandled: false };
}

export async function completeGatewayEvent(
  id: string,
  status: "processed" | "ignored" | "failed",
  error?: string,
): Promise<void> {
  const supabase = coreAdmin();
  const { error: updateError } = await supabase
    .from("payment_gateway_events")
    .update({ status, error: error ?? null, processed_at: new Date().toISOString() })
    .eq("id", id);
  if (updateError) throw updateError;
}
