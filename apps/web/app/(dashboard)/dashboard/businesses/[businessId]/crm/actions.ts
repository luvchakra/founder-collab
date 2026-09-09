"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createTicket, updateTicketStatus, assignTicket, emitTicketConvertedToProspect } from "@cofounderai/module-crm/lib/tickets/mutations";
import { getTicket, getFirstInboundMessageForTicket } from "@cofounderai/module-crm/lib/tickets/queries";
import { getConnectedProviderForChannel } from "@cofounderai/module-crm/lib/channel-accounts/queries";
import type { TicketStatus } from "@cofounderai/module-crm/lib/tickets/types";
import type { ChannelProvider } from "@cofounderai/module-crm/lib/channel-accounts/types";
import { createProspectFromExternalLead } from "@cofounderai/module-discovery/contract/index";
import type { CreateProspectFromExternalLeadInput } from "@cofounderai/module-discovery/contract/types";

// crm's ChannelProvider ("whatsapp_business") and discovery's contactChannel
// ("whatsapp") name the same four channels slightly differently -- each module owns
// its own vocabulary (crm's matches the provider's own API family name, discovery's
// matches the plain product name), so this composition-root action is where the two
// get reconciled rather than either module importing the other's naming.
const TO_CONTACT_CHANNEL: Record<ChannelProvider, CreateProspectFromExternalLeadInput["contactChannel"]> = {
  whatsapp_business: "whatsapp",
  instagram: "instagram",
  facebook_messenger: "facebook_messenger",
  google_business_messages: "google_business_messages",
};

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

/**
 * "Convert to prospect" (docs/design/crm-module-design.md Part A, A4) -- the one place
 * that gathers everything the ticket already knows (who, which channel, the opening
 * message) and hands it to module-discovery's own contract, rather than that contract
 * having to reach back into crm's schema itself (mechanism 2, ADR-10).
 */
export async function convertTicketToProspectAction(
  businessId: string,
  ticketId: string,
): Promise<{ error: string } | { success: true }> {
  try {
    const ticket = await getTicket(ticketId);
    if (!ticket) return { error: "This ticket could not be found." };
    if (!ticket.external_sender_handle || !ticket.channel_id) {
      return { error: "This ticket has no external sender to convert -- it wasn't created from an inbound channel message." };
    }

    const provider = await getConnectedProviderForChannel(ticket.channel_id);
    if (!provider) return { error: "This ticket's channel has no connected account, so its provider can't be determined." };

    const firstMessage = (await getFirstInboundMessageForTicket(businessId, ticketId)) ?? "(no message text found)";
    const companyName = ticket.subject?.replace(/ via \w+$/, "") || ticket.external_sender_handle;

    const result = await createProspectFromExternalLead(businessId, {
      companyName,
      contactChannel: TO_CONTACT_CHANNEL[provider],
      contactHandle: ticket.external_sender_handle,
      firstMessage,
      sourceTicketId: ticketId,
      existingPartyId: ticket.party_id,
    });
    if (!result.ok) {
      return {
        error:
          result.error === "MODULE_NOT_LICENSED"
            ? "Discovery isn't licensed for this business, so tickets can't be converted to prospects here."
            : result.error === "NOT_FOUND"
              ? "This business has no product yet to attach a prospect to -- create one first."
              : result.error,
      };
    }

    // B4 (docs/design/crm-module-design.md Part B) -- only once the prospect really
    // exists, mirroring discovery's own "publish after the fact is real" discipline.
    await emitTicketConvertedToProspect(businessId, ticketId, result.data.prospectId);
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Could not convert this ticket to a prospect." };
  }

  revalidatePath(detailPath(businessId));
  return { success: true };
}
