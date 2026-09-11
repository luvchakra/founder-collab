import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { listConversationQueue } from "@cofounderai/module-crm/lib/conversations/queries";
import { applyConversationQueueFilters } from "@cofounderai/module-crm/lib/conversations/queue";
import type { ConversationStatus } from "@cofounderai/module-crm/lib/conversations/types";
import { getConversationById } from "@cofounderai/module-crm/lib/interactions/queries";
import { getCurrentEmployeeId } from "@cofounderai/module-crm/lib/assignment/queries";
import { listEmployeeOptions } from "@cofounderai/module-crm/lib/tickets/queries";
import { getLead } from "@cofounderai/module-crm/lib/leads/queries";
import { getOpportunity } from "@cofounderai/module-crm/lib/opportunities/queries";
import { getConversationWhatsAppWindowStatus } from "@cofounderai/module-crm/lib/whatsapp/messaging";
import { getDraftReplyForInteraction } from "@cofounderai/module-crm/lib/interactions/draft-reply";
import { listWhatsAppTemplates } from "@cofounderai/module-crm/lib/whatsapp/templates";
import { getParty } from "@cofounderai/core/parties/queries";
import { formatDateTime } from "@cofounderai/core/lib/format";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Inbox, MessageCircle } from "lucide-react";
import { assignConversationAction, markInteractionNotActionableAction, sendWhatsAppReplyAction, sendWhatsAppTemplateAction } from "./actions";
import { WhatsAppReplyForm } from "./reply-form";
import { WhatsAppTemplateSendForm } from "./template-send-form";

const STATUSES: ConversationStatus[] = ["new", "open", "waiting", "resolved"];

const QUICK_FILTERS: { key: "needsResponse" | "assignedToMe" | "overdue" | "highIntent"; label: string }[] = [
  { key: "needsResponse", label: "Needs response" },
  { key: "assignedToMe", label: "Assigned to me" },
  { key: "overdue", label: "Overdue" },
  { key: "highIntent", label: "High intent" },
];

function conversationHref(businessId: string, params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return `/dashboard/businesses/${businessId}/crm/conversations${query ? `?${query}` : ""}`;
}

/**
 * CRM-06.2's Unified Inbox: left (filters/queues), center (conversation list), right
 * (conversation + CRM context) -- the backlog's own three-region layout, a real
 * three-column grid at `md` and up. Below `md`, three real columns don't fit: only one
 * pane shows at a time -- the list, or (once `?conversationId=` is set) the detail pane
 * with a back link -- per docs/design/claude-ui-design-rules.md rule 5's
 * "screen-size-appropriate layout." Each pane is rendered exactly once in the tree
 * (visibility toggled per breakpoint via a wrapper class) rather than duplicated per
 * breakpoint, since the filter form and assign form both contain fixed `id`s that would
 * collide if mounted twice at once.
 *
 * CRM-06.3's assign/reassign control lives in the right pane (`assignEntity()` already
 * supports "conversation" generically since CRM-05.4) -- "unassigned queue" is just the
 * Owner filter's own "Unassigned" option, not a separate screen.
 *
 * CRM-07.6/07.7/07.8: a WhatsApp conversation's right pane also shows either a free-form
 * reply composer (within the 24-hour customer service window) or a template-send form
 * (once it's closed, the one send path Meta still allows) -- other channels have no send
 * path yet, so they show neither. CRM-09.6 adds an AI-suggested draft (template-by-
 * intent, not a real model call -- see draft-reply.ts's own doc comment) above that
 * composer, computed from the conversation's last inbound message.
 */
export default async function CrmConversationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{
    conversationId?: string;
    needsResponse?: string;
    assignedToMe?: string;
    overdue?: string;
    highIntent?: string;
    channel?: string;
    status?: string;
    ownerId?: string;
  }>;
}) {
  const { businessId } = await params;
  const search = await searchParams;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [queue, employees, myEmployeeId] = await Promise.all([
    listConversationQueue(businessId),
    listEmployeeOptions(businessId),
    getCurrentEmployeeId(businessId),
  ]);
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  const channels = [...new Set(queue.map((c) => c.primary_channel))].sort();
  const rows = applyConversationQueueFilters(
    queue,
    {
      needsResponse: search.needsResponse === "1",
      assignedToMe: search.assignedToMe === "1",
      overdue: search.overdue === "1",
      highIntent: search.highIntent === "1",
      channel: search.channel || undefined,
      status: (search.status as ConversationStatus | undefined) || undefined,
      ownerId: search.ownerId || undefined,
    },
    myEmployeeId,
  );

  const selectedId = search.conversationId ?? rows[0]?.id;
  const selected = selectedId ? await getConversationById(businessId, selectedId) : null;
  const selectedParty = selected?.party_id ? await getParty(selected.party_id) : null;
  const selectedLead = selected?.lead_id ? await getLead(businessId, selected.lead_id) : null;
  const selectedOpportunity = selected?.opportunity_id ? await getOpportunity(businessId, selected.opportunity_id) : null;
  const whatsAppWindow = selected && selected.primary_channel === "whatsapp" ? await getConversationWhatsAppWindowStatus(businessId, selected.id) : null;
  const whatsAppTemplates = selected && selected.primary_channel === "whatsapp" && !whatsAppWindow?.withinWindow ? await listWhatsAppTemplates(businessId, { activeOnly: true }) : [];
  const lastInboundInteraction = selected ? [...selected.interactions].reverse().find((i) => i.direction === "inbound") : undefined;
  const suggestedReply =
    selected && whatsAppWindow?.withinWindow && lastInboundInteraction ? await getDraftReplyForInteraction(businessId, lastInboundInteraction.id) : null;

  const activeFilterParams = { channel: search.channel, status: search.status, ownerId: search.ownerId };
  const isQuickFilterOn = (key: string) => search[key as keyof typeof search] === "1";

  const filterBar = (
    <div className="flex flex-col gap-3 rounded-2xl border border-border p-3">
      <div className="flex flex-wrap gap-2">
        {QUICK_FILTERS.map((f) => (
          <Button key={f.key} asChild size="sm" variant={isQuickFilterOn(f.key) ? "secondary" : "outline"}>
            <Link href={conversationHref(businessId, { ...activeFilterParams, [f.key]: isQuickFilterOn(f.key) ? undefined : "1" })}>{f.label}</Link>
          </Button>
        ))}
      </div>
      <form method="get" className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="channel">Channel</Label>
          <NativeSelect id="channel" name="channel" defaultValue={search.channel ?? ""}>
            <option value="">All channels</option>
            {channels.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status">Status</Label>
          <NativeSelect id="status" name="status" defaultValue={search.status ?? ""}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ownerId">Owner</Label>
          <NativeSelect id="ownerId" name="ownerId" defaultValue={search.ownerId ?? ""}>
            <option value="">All owners</option>
            <option value="unassigned">Unassigned</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name ?? e.email ?? "Unnamed"}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" size="sm" variant="outline">
          Apply
        </Button>
      </form>
    </div>
  );

  const list = (
    <div className="flex flex-col divide-y rounded-2xl border border-border">
      {rows.length === 0 ? (
        <EmptyState icon={Inbox} message="No conversations match this view." />
      ) : (
        rows.map((row) => (
          <Link
            key={row.id}
            href={conversationHref(businessId, { ...activeFilterParams, ...Object.fromEntries(QUICK_FILTERS.filter((f) => isQuickFilterOn(f.key)).map((f) => [f.key, "1"])), conversationId: row.id })}
            className={`flex flex-col gap-1 p-3 text-sm hover:bg-muted/50 ${row.id === selectedId ? "bg-muted/50" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-medium">{row.partyName ?? "Unknown contact"}</span>
              <Badge variant="outline" className="shrink-0 capitalize">
                {row.status}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="capitalize">{row.primary_channel}</span>
              {row.needsResponse ? <Badge variant="destructive">Needs response</Badge> : null}
              {row.overdue ? <Badge variant="destructive">Overdue</Badge> : null}
              <span>{employeeById.get(row.assigned_to ?? "")?.full_name ?? "Unassigned"}</span>
              {row.last_interaction_at ? <span>{formatDateTime(row.last_interaction_at)}</span> : null}
            </div>
          </Link>
        ))
      )}
    </div>
  );

  const detail = selected ? (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            {selectedParty ? (
              <Link href={`/dashboard/businesses/${businessId}/crm/customers/${selectedParty.id}`} className="hover:underline">
                {selectedParty.name}
              </Link>
            ) : (
              "Unknown contact"
            )}
          </CardTitle>
          <Badge variant="outline" className="capitalize">
            {selected.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {selectedLead ? <Badge variant="outline">Lead: {selectedLead.status}</Badge> : null}
          {selectedOpportunity ? (
            <Link href={`/dashboard/businesses/${businessId}/crm/opportunities/${selectedOpportunity.id}`} className="hover:underline">
              <Badge variant="outline">Opportunity: {selectedOpportunity.status}</Badge>
            </Link>
          ) : null}
        </div>

        <form action={assignConversationAction.bind(null, businessId, selected.id)} className="flex items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assignOwnerId">Owner</Label>
            <NativeSelect id="assignOwnerId" name="ownerId" defaultValue={selected.assigned_to ?? ""} className="w-auto">
              <option value="">Unassigned</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name ?? e.email ?? "Unnamed"}
                </option>
              ))}
            </NativeSelect>
          </div>
          <SubmitButton size="sm" variant="outline" pendingText="Assigning...">
            Assign
          </SubmitButton>
        </form>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {selected.interactions.length === 0 ? (
            <EmptyState icon={MessageCircle} message="No interactions yet." />
          ) : (
            selected.interactions.map((interaction) => (
              <div key={interaction.id} className={`flex flex-col gap-1 rounded-lg border border-border p-2 text-sm ${interaction.direction === "outbound" ? "ml-6" : "mr-6"}`}>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="capitalize">
                    {interaction.direction} -- {interaction.channel}
                  </span>
                  <span>{formatDateTime(interaction.occurred_at)}</span>
                </div>
                <p>{interaction.content_excerpt ?? "(no preview)"}</p>
                {interaction.requires_response && !interaction.responded_at ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">Needs response</Badge>
                    <form action={markInteractionNotActionableAction.bind(null, businessId, interaction.id)}>
                      <SubmitButton size="sm" variant="ghost" pendingText="Marking...">
                        Not actionable
                      </SubmitButton>
                    </form>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>

        {selected.primary_channel === "whatsapp" ? (
          whatsAppWindow?.withinWindow ? (
            <WhatsAppReplyForm
              key={selected.interactions.length}
              action={sendWhatsAppReplyAction.bind(null, businessId, selected.id)}
              suggestedDraft={suggestedReply?.draft || null}
              suggestedDraftSources={suggestedReply?.sources}
            />
          ) : (
            <div className="flex flex-col gap-3 border-t border-border pt-3">
              <p className="text-sm text-muted-foreground">
                This conversation&apos;s 24-hour WhatsApp window has closed
                {whatsAppWindow?.expiresAt ? ` (closed ${formatDateTime(whatsAppWindow.expiresAt)})` : ""} -- a free-form reply can&apos;t be
                sent, but a pre-approved template can.
              </p>
              <WhatsAppTemplateSendForm
                key={selected.interactions.length}
                templates={whatsAppTemplates}
                action={sendWhatsAppTemplateAction.bind(null, businessId, selected.id)}
              />
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  ) : (
    <EmptyState icon={MessageCircle} message="Select a conversation to see its details." />
  );

  // Each of filterBar/list/detail is rendered exactly once below (never referenced
  // twice) -- both because that's simply correct, and because `detail`/the filter form
  // contain fixed `id`s (NativeSelect ids, the assign form's `assignOwnerId`) that would
  // collide if the same block were mounted twice at once (e.g. one copy for mobile, one
  // for desktop, both hidden/shown by Tailwind responsive classes rather than genuinely
  // absent). Visibility per breakpoint is controlled by wrapping each single instance in
  // its own `hidden md:block`/no-class toggle instead.
  const isViewingConversation = Boolean(search.conversationId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Conversations</h1>
        <p className="mt-1 text-sm text-muted-foreground">{business.name}&apos;s unified inbox across every channel.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className={isViewingConversation ? "hidden md:block" : ""}>{filterBar}</div>
        <div className={isViewingConversation ? "hidden md:block" : ""}>{list}</div>
        <div className={isViewingConversation ? "" : "hidden md:block"}>
          {isViewingConversation ? (
            <Link href={conversationHref(businessId, activeFilterParams)} className="mb-3 block text-sm text-muted-foreground hover:underline md:hidden">
              &larr; Back to conversations
            </Link>
          ) : null}
          {detail}
        </div>
      </div>
    </div>
  );
}
