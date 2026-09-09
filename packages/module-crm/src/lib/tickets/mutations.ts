import { createClient } from "../../db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { publish } from "@cofounderai/core/events/mutations";
import type { TicketStatus } from "./types";

/** S-1's own skeleton scope: manual ticket creation + status/assignment updates only --
 * real message ingestion (a channel actually receiving an email/WhatsApp message and
 * creating/updating a ticket from it) is a later story's own consumer, not this one.
 * `requireModule()` (defense in depth, CLAUDE.md's licensing architecture section) --
 * this module's demonstrated call site. */
export async function createTicket(businessId: string, subject: string, channelId?: string): Promise<void> {
  await requireModule(businessId, "crm");
  const supabase = await createClient();
  const { error } = await supabase.from("tickets").insert({ business_id: businessId, subject: subject || null, channel_id: channelId || null });
  if (error) throw error;
}

/** A plain `.update().eq("id", ...)` with no `.select()` would silently "succeed" with
 * zero rows changed if RLS's `using` clause filters the row out (e.g. the business's crm
 * license just lapsed into its read-only grace period) -- Postgres RLS excludes
 * non-matching rows from an UPDATE rather than raising an error, unlike an INSERT's
 * `with check`, which does throw. Selecting the row back and checking it's non-empty is
 * what turns that silent no-op into the actionable error a caller can actually show. */
export async function updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tickets").update({ status }).eq("id", ticketId).select("id, business_id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("This ticket could not be updated -- it may have been removed, or your access to it may have changed.");
  }

  // B4 (docs/design/crm-module-design.md Part B) -- runs through the normal
  // RLS-scoped client (a real signed-in agent closing a ticket), unlike
  // ingest-inbound-message.ts's own ticket.created emission, which has no session to
  // publish through and writes core.domain_events directly instead.
  if (status === "closed") {
    await publish({ businessId: data[0]!.business_id, type: "ticket.resolved", payload: { ticketId } });
  }
}

export async function assignTicket(ticketId: string, employeeId: string | null): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tickets").update({ assigned_to: employeeId }).eq("id", ticketId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("This ticket could not be updated -- it may have been removed, or your access to it may have changed.");
  }
}

/** B4's third emitted event (docs/design/crm-module-design.md Part B) -- called by
 * the "Convert to prospect" action (apps/web) right after module-discovery's contract
 * call succeeds, so a consumer reacting to this can assume the prospect already
 * exists, same "publish only once the thing it describes is real" discipline
 * discovery's own prospect.won emission follows. */
export async function emitTicketConvertedToProspect(
  businessId: string,
  ticketId: string,
  prospectId: string,
): Promise<void> {
  await publish({ businessId, type: "ticket.converted_to_prospect", payload: { ticketId, prospectId } });
}

/**
 * B2's ticket enrichment (docs/design/crm-module-design.md Part B): links a ticket to
 * the specific order/invoice, job, or gst generation-history row it's actually about.
 * Both fields clear together -- `related` is either a real module+id pair or nothing,
 * matching the tickets_related_module_requires_document check constraint (a mismatched
 * pair would fail at the database, but failing clearly here means a caller sees a
 * normal validation error, not a raw Postgres constraint message).
 */
export async function setTicketRelatedDocument(
  ticketId: string,
  related: { module: "inventory" | "fsm" | "gst"; documentId: string } | null,
): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tickets")
    .update({
      related_module: related?.module ?? null,
      related_document_id: related?.documentId ?? null,
    })
    .eq("id", ticketId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("This ticket could not be updated -- it may have been removed, or your access to it may have changed.");
  }
}
