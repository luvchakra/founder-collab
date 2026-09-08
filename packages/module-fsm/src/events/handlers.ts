import { registerEventHandler } from "@cofounderai/core/events/registry";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import type { DomainEvent } from "@cofounderai/core/events/types";
import { createAdminClient as createFsmAdminClient } from "../db/admin";

/**
 * module-fsm's own event subscriptions (00-MASTER-PLAN.md's module contract layout).
 * Imported once, for its side effect, from apps/web/app/api/cron/drain-events/route.ts
 * before the drain loop runs -- same reasoning module-inventory's own handlers.ts
 * already documents: core/events/registry.ts's map is populated at import time, and an
 * event type with no registered handler fails permanently on its very next drain.
 *
 * F-13 (Discovery -> FSM handoff, 02-FSM-PRD.md §6): `discovery` publishes `prospect.won`
 * (module-discovery/lib/prospects/mutations.ts#setProspectOutcome) with
 * `requiredModule: 'fsm'` -- drainDomainEvents() parks it (status='parked', no attempts
 * penalty) rather than calling this handler at all when fsm isn't licensed yet, and
 * core.replay_parked_events() (wired into activateLicense(), C-4) un-parks it the moment
 * it is, with zero code here needing to know that happened.
 */
registerEventHandler("prospect.won", async (event: DomainEvent) => {
  const payload = event.payload as {
    workspaceId?: string;
    prospectId?: string;
    partyId?: string;
    companyName?: string;
    description?: string | null;
  };
  if (!payload.prospectId || !payload.partyId) {
    throw new Error("prospect.won payload missing prospectId/partyId.");
  }

  const fsm = createFsmAdminClient();

  // Idempotent: a replayed event (license reactivation, or a retried drain attempt after
  // a transient failure past this point) must never create a second opportunity for the
  // same prospect (PRD §7 acceptance criteria #1: "no duplicate party or contact rows").
  const { data: existing, error: existingError } = await fsm
    .from("opportunities")
    .select("id")
    .eq("business_id", event.business_id)
    .eq("source", "discovery")
    .eq("source_prospect_id", payload.prospectId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return;

  const core = createCoreAdminClient({ schema: "core" });
  const { data: owner, error: ownerError } = await core
    .from("business_members")
    .select("user_id")
    .eq("business_id", event.business_id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (ownerError) throw ownerError;
  if (!owner) throw new Error(`No owner found for business ${event.business_id} -- cannot attribute the new opportunity.`);

  const { error: insertError } = await fsm.from("opportunities").insert({
    business_id: event.business_id,
    party_id: payload.partyId,
    description: payload.description || `From discovery: ${payload.companyName ?? "won prospect"}`,
    scope_of_work: payload.description || null,
    source: "discovery",
    source_prospect_id: payload.prospectId,
    source_workspace_id: payload.workspaceId ?? null,
    created_by: owner.user_id,
  });
  if (insertError) throw insertError;
});
