"use server";

import { revalidatePath } from "next/cache";
import { createTicket, updateTicketStatus, assignTicket } from "@cofounderai/module-crm/lib/tickets/mutations";
import type { TicketStatus } from "@cofounderai/module-crm/lib/tickets/types";

function detailPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/crm`;
}

export async function createTicketAction(businessId: string, subject: string, channelId?: string): Promise<void> {
  await createTicket(businessId, subject, channelId);
  revalidatePath(detailPath(businessId));
}

export async function updateTicketStatusAction(businessId: string, ticketId: string, status: TicketStatus): Promise<void> {
  await updateTicketStatus(ticketId, status);
  revalidatePath(detailPath(businessId));
}

export async function assignTicketAction(businessId: string, ticketId: string, employeeId: string | null): Promise<void> {
  await assignTicket(ticketId, employeeId);
  revalidatePath(detailPath(businessId));
}
