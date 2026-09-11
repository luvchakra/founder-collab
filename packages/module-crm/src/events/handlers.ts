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

/**
 * CRM-10.4's "Back-in-Stock Follow-up": "When Inventory publishes a replenishment
 * event: find relevant open interests -> create suggested follow-up -> let user
 * approve/send communication." Published from a real purchase-order receipt
 * (`inventory.receive_purchase_order_item()`, CRM-10.3's own migration), `required_module:
 * 'crm'` on that event means this only ever runs for a business with crm actually
 * licensed.
 *
 * "Open interest" here means CRM-10.3's own waitlist: a `crm.follow_up` row with
 * `product_interest_id` set and still `status = 'pending'` -- an interest nobody ever
 * waitlisted isn't "open" in any actionable sense (there's no task to surface). Rather
 * than creating a *second* follow-up row (which would need yet another linking column
 * and leave two rows about the same wait), this pulls the existing waitlist task
 * forward to `due_at = now()` -- dormant-but-real becomes due-now, the "suggested
 * follow-up" this story asks for. It never sends anything itself ("let user
 * approve/send communication" -- completing the task is the human's own separate,
 * already-existing action); the Follow-ups queue's own label for a waitlisted row
 * already flips from "Waitlist: X" to "Back in stock: X" once live availability
 * confirms it (follow-ups/queries.ts), computed fresh rather than stored, same
 * "never persisted" discipline CRM-10.2's own availability read already established.
 */
registerEventHandler("inventory.stock.replenished", async (event: DomainEvent) => {
  const payload = event.payload as { itemId?: string };
  if (!payload.itemId) return;

  const crm = createCrmAdminClient();

  const { data: interests, error: interestsError } = await crm.from("product_interest").select("id").eq("business_id", event.business_id).eq("item_id", payload.itemId);
  if (interestsError) throw interestsError;
  if (!interests || interests.length === 0) return;

  const { error: updateError } = await crm
    .from("follow_up")
    .update({ due_at: new Date().toISOString(), priority: "high" })
    .eq("business_id", event.business_id)
    .eq("status", "pending")
    .in(
      "product_interest_id",
      interests.map((i) => i.id),
    );
  if (updateError) throw updateError;
});

/**
 * INT-06.2's "Additional Work -> CRM Opportunity": "Job completed -> additional work
 * identified -> CRM creates suggested opportunity -> existing party/job context
 * attached -> owner reviews. No automatic customer message." Published from
 * `completeJob()` (module-fsm/src/lib/jobs/mutations.ts) once the founder classifies a
 * job's outcome as `additional_work_required` (INT-06.1) -- FSM never imports CRM's
 * contract, so this event is the only legal way that outcome reaches CRM (mechanism 3,
 * ADR-5).
 *
 * Idempotent per `(business_id, source_module: 'fsm_job', source_reference: jobId)` --
 * `crm.opportunity`'s own new columns (INT-06.2's migration), same generic pair
 * `crm.lead` already has -- so a replayed drain attempt or a reopened-and-recompleted
 * job never creates a second suggested opportunity for the same job. No `stage_id` set,
 * same as `convertLeadToOpportunity()`'s own established shape for a freshly created
 * opportunity; "existing party/job context attached" is a `crm.crm_note` on the new
 * opportunity (job number/description/outcome notes), not a message to the customer --
 * this handler never sends anything, it only creates a row for "owner reviews."
 */
registerEventHandler("fsm.job.additional_work_identified", async (event: DomainEvent) => {
  const payload = event.payload as { jobId?: string; partyId?: string; jobNumber?: string | null; description?: string | null; outcomeNotes?: string | null };
  if (!payload.jobId || !payload.partyId) return;

  const crm = createCrmAdminClient();

  const { data: existing, error: existingError } = await crm
    .from("opportunity")
    .select("id")
    .eq("business_id", event.business_id)
    .eq("source_module", "fsm_job")
    .eq("source_reference", payload.jobId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return;

  const { data: opportunity, error: insertError } = await crm
    .from("opportunity")
    .insert({
      business_id: event.business_id,
      party_id: payload.partyId,
      source: "fsm",
      source_module: "fsm_job",
      source_reference: payload.jobId,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  const noteLines = [payload.jobNumber ? `Additional work identified on FSM job ${payload.jobNumber}.` : "Additional work identified on a completed FSM job.", payload.description, payload.outcomeNotes].filter(
    (line): line is string => Boolean(line),
  );

  const { error: noteError } = await crm.from("crm_note").insert({
    business_id: event.business_id,
    party_id: payload.partyId,
    opportunity_id: opportunity.id,
    body: noteLines.join(" "),
  });
  if (noteError) throw noteError;
});
