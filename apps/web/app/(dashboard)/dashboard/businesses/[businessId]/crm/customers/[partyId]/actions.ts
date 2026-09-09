"use server";

import { revalidatePath } from "next/cache";
import { setTicketRelatedDocument } from "@cofounderai/module-crm/lib/tickets/mutations";

/**
 * B2 (docs/design/crm-module-design.md Part B) -- called from the Customer 360 panel
 * when it's reached with `?ticketId=`, letting an agent mark "this ticket is about
 * that order/job" from the same place they can already see the party's full history,
 * rather than needing a separate ticket-detail page just to hold this one control.
 */
export async function linkTicketToDocumentAction(
  businessId: string,
  partyId: string,
  ticketId: string,
  related: { module: "inventory" | "fsm" | "gst"; documentId: string } | null,
): Promise<void> {
  await setTicketRelatedDocument(ticketId, related);
  revalidatePath(`/dashboard/businesses/${businessId}/crm/customers/${partyId}`);
}
