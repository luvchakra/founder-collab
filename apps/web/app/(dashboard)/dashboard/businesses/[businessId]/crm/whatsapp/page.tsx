import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { listChannelConnections } from "@cofounderai/module-crm/lib/channel-connections/queries";
import { listWhatsAppTemplates } from "@cofounderai/module-crm/lib/whatsapp/templates";
import { formatDateTime } from "@cofounderai/core/lib/format";
import { Badge } from "@cofounderai/core/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { FileText } from "lucide-react";
import { connectWhatsAppAction, createWhatsAppTemplateAction, deactivateWhatsAppTemplateAction, disconnectWhatsAppAction } from "./actions";
import { ConnectWhatsAppForm } from "./connect-form";
import { AddWhatsAppTemplateForm } from "./template-form";

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
 *
 * CRM-07.8 adds the template catalog below the connection card -- registering a
 * template that's already been created and approved in Meta's own dashboard, so the
 * Conversations page's template-send form (shown once a conversation's 24-hour window
 * closes) knows its name/language/variable count.
 */
export default async function CrmWhatsAppPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const connections = await listChannelConnections(businessId);
  const whatsapp = connections.find((c) => c.channel === "whatsapp" && c.status !== "disconnected");
  const templates = await listWhatsAppTemplates(businessId);

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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Template catalog</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Register templates you&apos;ve already created and had approved in Meta&apos;s own dashboard -- this list doesn&apos;t submit anything to Meta, it just tells the send
            flow each template&apos;s name, language, and how many variables to fill in.
          </p>
          {templates.length === 0 ? (
            <EmptyState icon={FileText} message="No templates registered yet." />
          ) : (
            <ul className="flex flex-col divide-y">
              {templates.map((template) => (
                <li key={template.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium">{template.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {template.language_code} -- {template.variable_count} variable{template.variable_count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!template.is_active ? <Badge variant="outline">Inactive</Badge> : null}
                    {template.is_active ? (
                      <form action={deactivateWhatsAppTemplateAction.bind(null, businessId, template.id)}>
                        <SubmitButton size="sm" variant="ghost" pendingText="Removing...">
                          Deactivate
                        </SubmitButton>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <AddWhatsAppTemplateForm action={createWhatsAppTemplateAction.bind(null, businessId)} />
        </CardContent>
      </Card>
    </div>
  );
}
