import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { listChannelConnections } from "@cofounderai/module-crm/lib/channel-connections/queries";
import { listWhatsAppTemplates } from "@cofounderai/module-crm/lib/whatsapp/templates";
import { listClickToChatLinks, countAttributedConversations } from "@cofounderai/module-crm/lib/click-to-chat/queries";
import { buildWaMeLink } from "@cofounderai/module-crm/lib/click-to-chat/link";
import { formatDateTime } from "@cofounderai/core/lib/format";
import { Alert, AlertDescription } from "@cofounderai/core/ui/alert";
import { Badge } from "@cofounderai/core/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { FileText, Link2 } from "lucide-react";
import {
  checkWhatsAppConnectionNowAction,
  connectWhatsAppAction,
  createClickToChatLinkAction,
  createWhatsAppTemplateAction,
  deactivateClickToChatLinkAction,
  deactivateWhatsAppTemplateAction,
  disconnectWhatsAppAction,
} from "./actions";
import { ConnectWhatsAppForm } from "./connect-form";
import { CreateClickToChatLinkForm } from "./click-to-chat-form";
import { AddWhatsAppTemplateForm } from "./template-form";

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  connected: "secondary",
  degraded: "outline",
  reauthorization_required: "destructive",
  disconnected: "outline",
  provider_error: "destructive",
};

/** CRM-15.5's "user must have a visible resolution path" -- one line of plain-language
 * explanation plus what to actually do about it, per required status. `connected` and
 * `disconnected` need neither (a disconnected business just sees the connect form). */
const STATUS_RESOLUTION: Partial<Record<string, string>> = {
  degraded: "WhatsApp is temporarily rate-limited by Meta -- this usually clears on its own within a few minutes. We recheck automatically, or you can check now below.",
  provider_error: "Meta's WhatsApp API isn't responding right now. We recheck automatically, or you can check now below.",
  reauthorization_required: "Your WhatsApp access token is no longer valid -- reconnect below with a fresh token from Meta.",
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
  const clickToChatLinks = await listClickToChatLinks(businessId);
  const clickToChatCounts = await Promise.all(clickToChatLinks.map((link) => countAttributedConversations(businessId, link.id)));

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
              {STATUS_RESOLUTION[whatsapp.status] ? (
                <Alert variant={whatsapp.status === "degraded" ? "default" : "destructive"}>
                  <AlertDescription>{STATUS_RESOLUTION[whatsapp.status]}</AlertDescription>
                </Alert>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Phone number ID</span>
                <span className="font-medium">{whatsapp.external_account_id}</span>
              </div>
              {whatsapp.last_synced_at ? (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Last checked</span>
                  <span>{formatDateTime(whatsapp.last_synced_at)}</span>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-2">
                {whatsapp.status === "degraded" || whatsapp.status === "provider_error" ? (
                  <form action={checkWhatsAppConnectionNowAction.bind(null, businessId, whatsapp.id)}>
                    <SubmitButton variant="outline" pendingText="Checking...">
                      Check now
                    </SubmitButton>
                  </form>
                ) : null}
                <form action={disconnectWhatsAppAction.bind(null, businessId, whatsapp.id)}>
                  <SubmitButton variant="outline" pendingText="Disconnecting...">
                    Disconnect
                  </SubmitButton>
                </form>
              </div>
              {whatsapp.status === "reauthorization_required" ? (
                <div className="border-t pt-3">
                  <p className="pb-2 text-xs text-muted-foreground">Reconnect with a fresh access token:</p>
                  <ConnectWhatsAppForm action={connectWhatsAppAction.bind(null, businessId)} />
                </div>
              ) : null}
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Click-to-chat links</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Each link opens a WhatsApp chat with a pre-filled message and attributes the resulting conversation back to you -- share it on a bio, a flyer, or an ad.
          </p>
          {clickToChatLinks.length === 0 ? (
            <EmptyState icon={Link2} message="No click-to-chat links yet." />
          ) : (
            <ul className="flex flex-col divide-y">
              {clickToChatLinks.map((link, index) => {
                const url = buildWaMeLink(link.whatsapp_number, link.prefilled_message);
                const attributedCount = clickToChatCounts[index] ?? 0;
                return (
                  <li key={link.id} className="flex flex-col gap-2 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="font-medium">{link.label}</span>
                        {link.campaign ? <span className="text-xs text-muted-foreground">{link.campaign}</span> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        {!link.is_active ? <Badge variant="outline">Inactive</Badge> : null}
                        <Badge variant="secondary">{attributedCount} conversation{attributedCount === 1 ? "" : "s"}</Badge>
                        {link.is_active ? (
                          <form action={deactivateClickToChatLinkAction.bind(null, businessId, link.id)}>
                            <SubmitButton size="sm" variant="ghost" pendingText="Removing...">
                              Deactivate
                            </SubmitButton>
                          </form>
                        ) : null}
                      </div>
                    </div>
                    <a href={url} target="_blank" rel="noreferrer" className="break-all text-xs text-primary underline underline-offset-2">
                      {url}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          <CreateClickToChatLinkForm action={createClickToChatLinkAction.bind(null, businessId)} />
        </CardContent>
      </Card>
    </div>
  );
}
