"use server";

import { revalidatePath } from "next/cache";
import { setTicketRelatedDocument } from "@cofounderai/module-crm/lib/tickets/mutations";
import { generateCustomerSummary } from "@cofounderai/module-crm/lib/ai/customer-summary";

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

/** CRM-12.1's "Generate summary" button -- caches on `crm.customer_summary`
 * (generateCustomerSummary()'s own input-hash check), so `revalidatePath` here just
 * keeps the server-rendered `generatedAt` timestamp in sync with what the client just
 * received. */
export async function generateCustomerSummaryAction(businessId: string, partyId: string): Promise<{ summary: string } | { error: string }> {
  try {
    const result = await generateCustomerSummary(businessId, partyId);
    revalidatePath(`/dashboard/businesses/${businessId}/crm/customers/${partyId}`);
    return result;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate a summary." };
  }
}
