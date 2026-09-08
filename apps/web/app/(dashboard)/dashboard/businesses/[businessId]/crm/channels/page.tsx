import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { listChannels } from "@cofounderai/module-crm/lib/channels/queries";
import { ChannelsView } from "@cofounderai/module-crm/components/channels/channels-view";
import { createChannelAction, setChannelActiveAction } from "./actions";

export default async function CrmChannelsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const channels = await listChannels(businessId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Channels</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The inboxes {business.name} receives customer messages through.
        </p>
      </div>

      <ChannelsView
        channels={channels}
        createAction={createChannelAction.bind(null, businessId)}
        setActiveAction={setChannelActiveAction.bind(null, businessId)}
      />
    </div>
  );
}
