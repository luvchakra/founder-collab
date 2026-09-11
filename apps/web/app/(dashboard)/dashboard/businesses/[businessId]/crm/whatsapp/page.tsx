import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { listChannelConnections } from "@cofounderai/module-crm/lib/channel-connections/queries";
import { formatDateTime } from "@cofounderai/core/lib/format";
import { Badge } from "@cofounderai/core/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { connectWhatsAppAction, disconnectWhatsAppAction } from "./actions";
import { ConnectWhatsAppForm } from "./connect-form";

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  connected: "secondary",
  degraded: "outline",
  reauthorization_required: "destructive",
  disconnected: "outline",
  provider_error: "destructive",
};

/**
 * CRM-07.1/07.2: WhatsApp connection management -- the provider-neutral
 * `crm.channel_connection` successor to the old `crm.channel_accounts`
 * (docs/design/crm-backlog-audit.md's retirement table). A business connects by
 * pasting a phone_number_id + access token it already obtained (Meta's own Embedded
 * Signup flow hands back the same two values; this form is where either that flow or a
 * manual App-dashboard token lands) -- `connectWhatsApp()` verifies them against the
 * real Graph API before ever storing anything. The token itself is never rendered back
 * once connected, per that story's own acceptance criterion.
 */
export default async function CrmWhatsAppPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const connections = await listChannelConnections(businessId);
  const whatsapp = connections.find((c) => c.channel === "whatsapp" && c.status !== "disconnected");

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">WhatsApp</h1>
        <p className="mt-1 text-sm text-muted-foreground">{business.name}&apos;s WhatsApp Business connection.</p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Connection</CardTitle>
            {whatsapp ? <Badge variant={STATUS_VARIANT[whatsapp.status] ?? "outline"}>{whatsapp.status.replaceAll("_", " ")}</Badge> : null}
          </div>
        </CardHeader>
        <CardContent>
          {whatsapp ? (
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Phone number ID</span>
                <span className="font-medium">{whatsapp.external_account_id}</span>
              </div>
              {whatsapp.last_synced_at ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Connected</span>
                  <span>{formatDateTime(whatsapp.last_synced_at)}</span>
                </div>
              ) : null}
              <form action={disconnectWhatsAppAction.bind(null, businessId, whatsapp.id)} className="pt-2">
                <SubmitButton variant="outline" pendingText="Disconnecting...">
                  Disconnect
                </SubmitButton>
              </form>
            </div>
          ) : (
            <ConnectWhatsAppForm action={connectWhatsAppAction.bind(null, businessId)} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
