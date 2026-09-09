import { createClient } from "../../db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
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
  const { data, error } = await supabase.from("tickets").update({ status }).eq("id", ticketId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("This ticket could not be updated -- it may have been removed, or your access to it may have changed.");
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
