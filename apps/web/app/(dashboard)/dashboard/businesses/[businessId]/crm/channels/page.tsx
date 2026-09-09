import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { listChannels } from "@cofounderai/module-crm/lib/channels/queries";
import { listChannelAccounts } from "@cofounderai/module-crm/lib/channel-accounts/queries";
import { ChannelsView } from "@cofounderai/module-crm/components/channels/channels-view";
import { ChannelAccountsPanel } from "@cofounderai/module-crm/components/channels/channel-accounts-panel";
import {
  createChannelAction,
  setChannelActiveAction,
  connectChannelAccountAction,
  disconnectChannelAccountAction,
  setInstantReplyModeAction,
} from "./actions";

export default async function CrmChannelsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [channels, accounts] = await Promise.all([listChannels(businessId), listChannelAccounts(businessId)]);

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

      <ChannelAccountsPanel
        channels={channels}
        accounts={accounts}
        connectAction={(input) => connectChannelAccountAction(businessId, input)}
        disconnectAction={disconnectChannelAccountAction.bind(null, businessId)}
        setInstantReplyModeAction={(channelAccountId, mode) => setInstantReplyModeAction(businessId, channelAccountId, mode)}
      />
    </div>
  );
}
