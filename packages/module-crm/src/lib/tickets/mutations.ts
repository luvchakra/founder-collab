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

export async function updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("tickets").update({ status }).eq("id", ticketId);
  if (error) throw error;
}

export async function assignTicket(ticketId: string, employeeId: string | null): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("tickets").update({ assigned_to: employeeId }).eq("id", ticketId);
  if (error) throw error;
}
