import { createClient } from "../db/server";
import type { DomainEvent } from "./types";

/**
 * Publishes a domain event -- mechanism 3 of the three legal ways modules communicate
 * (00-MASTER-PLAN.md §6): use this when you don't need an answer now. Runs as the
 * calling user through the normal RLS-scoped client, same as any other write; there's
 * no service-role path needed since a publisher always has a real business_id it's
 * already a member of.
 *
 * `requiredModule`: set this when the event only makes sense to act on once a specific
 * module is licensed (e.g. an inventory-consuming event published while inventory isn't
 * licensed yet) -- the drain loop parks it instead of failing it, and
 * activateLicense() (C-4) replays every parked event for that module once it's bought.
 * Leave it unset for an event any licensed-by-default consumer can act on immediately.
 */
export async function publish(input: {
  businessId: string;
  type: string;
  payload?: Record<string, unknown>;
  requiredModule?: string;
}): Promise<DomainEvent> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase
    .from("domain_events")
    .insert({
      business_id: input.businessId,
      type: input.type,
      payload: input.payload ?? {},
      required_module: input.requiredModule ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
