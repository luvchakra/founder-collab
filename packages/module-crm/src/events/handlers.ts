import { registerEventHandler } from "@cofounderai/core/events/registry";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import type { DomainEvent } from "@cofounderai/core/events/types";
import { createAdminClient as createCrmAdminClient } from "../db/admin";

/**
 * module-crm's own event subscriptions (00-MASTER-PLAN.md's module contract layout;
 * docs/design/crm-module-design.md Part B, B4's "consume" side). Imported once, for its
 * side effect, from apps/web/app/api/cron/drain-events/route.ts before the drain loop
 * runs -- same reasoning module-fsm's/module-gst's/module-inventory's own handlers.ts
 * already document. core/events/registry.ts now supports more than one handler per
 * event type specifically so this file's own `prospect.won` subscription can coexist
 * with module-fsm's (an unrelated reason to react to the same event) without either
 * silently overwriting the other's registration.
 *
 * The design doc's own note that "B1's Customer 360 panel already surfaces prospect.won
 * reactively, which covers the same founder-facing need" was true when B1 shipped
 * without this consumer -- this adds the proactive half on top of that reactive one
 * (surfacing on the *ticket itself*, not only a separate Customer 360 lookup), per the
 * explicit instruction to leave nothing on this design doc's list still deferred.
 */
registerEventHandler("prospect.won", async (event: DomainEvent) => {
  const payload = event.payload as { partyId?: string; companyName?: string };
  if (!payload.partyId) return;

  const crm = createCrmAdminClient();
  const core = createCoreAdminClient({ schema: "core" });

  const { data: tickets, error: ticketsError } = await crm
    .from("tickets")
    .select("id, subject")
    .eq("business_id", event.business_id)
    .eq("party_id", payload.partyId)
    .neq("status", "closed");
  if (ticketsError) throw ticketsError;
  if (!tickets || tickets.length === 0) return;

  const noteBody = `[Internal note -- not sent to customer] ${payload.companyName ?? "This contact"} just became a customer (won in Discovery).`;

  for (const ticket of tickets) {
    const { data: thread, error: threadError } = await core
      .from("threads")
      .select("id")
      .eq("business_id", event.business_id)
      .eq("entity_type", "crm_ticket")
      .eq("entity_id", ticket.id)
      .maybeSingle();
    if (threadError) throw threadError;

    let threadId = thread?.id as string | undefined;
    if (!threadId) {
      const { data: newThread, error: createThreadError } = await core
        .from("threads")
        .insert({ business_id: event.business_id, entity_type: "crm_ticket", entity_id: ticket.id, subject: ticket.subject })
        .select("id")
        .single();
      if (createThreadError) throw createThreadError;
      threadId = newThread.id;
    }

    // Idempotent: a replayed event (retried drain attempt, or a license reactivation
    // un-parking this) must never post the same note twice on the same ticket.
    const { data: existingNote, error: existingNoteError } = await core
      .from("messages")
      .select("id")
      .eq("thread_id", threadId)
      .eq("body", noteBody)
      .maybeSingle();
    if (existingNoteError) throw existingNoteError;
    if (existingNote) continue;

    const { error: insertError } = await core.from("messages").insert({
      business_id: event.business_id,
      thread_id: threadId,
      direction: "outbound",
      channel: "email",
      body: noteBody,
      status: "draft",
    });
    if (insertError) throw insertError;
  }
});
