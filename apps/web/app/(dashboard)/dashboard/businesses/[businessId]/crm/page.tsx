import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { listTickets, listEmployeeOptions } from "@cofounderai/module-crm/lib/tickets/queries";
import { listChannels } from "@cofounderai/module-crm/lib/channels/queries";
import { InboxView } from "@cofounderai/module-crm/components/tickets/inbox-view";
import { createTicketAction, updateTicketStatusAction, assignTicketAction, convertTicketToProspectAction } from "./actions";

export default async function CrmInboxPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [tickets, channels, employees] = await Promise.all([
    listTickets(businessId),
    listChannels(businessId),
    listEmployeeOptions(businessId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Inbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">{business.name}&apos;s customer conversations.</p>
      </div>

      <InboxView
        businessId={businessId}
        tickets={tickets}
        channels={channels}
        employees={employees}
        createAction={createTicketAction.bind(null, businessId)}
        updateStatusAction={updateTicketStatusAction.bind(null, businessId)}
        assignAction={assignTicketAction.bind(null, businessId)}
        convertToProspectAction={convertTicketToProspectAction.bind(null, businessId)}
      />
    </div>
  );
}
