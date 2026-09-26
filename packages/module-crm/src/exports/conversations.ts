// EXP-CRM-09 -- Conversations / WhatsApp export (/crm/conversations): the filtered inbox
// list and the messages of the conversation in view.
import { ExportDeniedError, type ExportAdapter } from "@cofounderai/core/exports/server";
import { getCurrentEmployeeId } from "../lib/assignment/queries";
import { applyConversationQueueFilters, type ConversationQueueRow } from "../lib/conversations/queue";
import type { ConversationStatus } from "../lib/conversations/types";
import { listEmployeeOptions } from "../lib/tickets/queries";
import { CHANNEL_LABEL, employeeMap, humanize, labelOf, ownerName } from "./labels";
import { getConversationMessagesForExport, listConversationQueueForExport, listPartiesForExport, type ExportMessage } from "./queries";

const STATUSES: ConversationStatus[] = ["new", "open", "waiting", "resolved"];

export type ConversationExportFilters = {
  conversationId: string;
  needsResponse: boolean;
  assignedToMe: boolean;
  overdue: boolean;
  highIntent: boolean;
  channel: string;
  status: ConversationStatus | "";
  ownerId: string;
};

export function parseConversationFilters(params: URLSearchParams): ConversationExportFilters {
  const status = params.get("status") ?? "";
  return {
    conversationId: params.get("conversationId") ?? "",
    needsResponse: params.get("needsResponse") === "1",
    assignedToMe: params.get("assignedToMe") === "1",
    overdue: params.get("overdue") === "1",
    highIntent: params.get("highIntent") === "1",
    channel: params.get("channel") ?? "",
    status: STATUSES.includes(status as ConversationStatus) ? (status as ConversationStatus) : "",
    ownerId: params.get("ownerId") ?? "",
  };
}

type MessageRow = ExportMessage & { sender: string; recipient: string };

/**
 * Two sheets, mirroring the inbox's list and detail panes:
 *
 * - `Conversations`: the list after the page's own filters (quick filters, channel,
 *   status, owner) -- every matching conversation, not the first 1,000.
 * - `Messages`: the conversation the page has open (`?conversationId=`, or the list's
 *   first row exactly as the page picks it). A `conversationId` that isn't this
 *   business's is refused as not found.
 *
 * Message text is the same excerpt the inbox shows every `crm.view` holder. Nothing a
 * provider supplied beyond that is read: no metadata object, media reference, content
 * reference, provider message/actor id or token -- only the delivery status the inbox
 * already displays. CRM has no secret-redaction policy for message content today, so
 * none is applied. The CSV carries the Messages sheet when a conversation was opened
 * explicitly, the conversation list otherwise.
 */
export const crmConversationsExport: ExportAdapter<ConversationExportFilters> = {
  id: "crm.conversations",
  module: "crm",
  permissions: ["crm.view"],
  parseFilters: parseConversationFilters,
  describeFilters: (f) => ({
    Conversation: f.conversationId ? "Selected conversation" : "",
    "Needs response": f.needsResponse ? "Yes" : "",
    "Assigned to me": f.assignedToMe ? "Yes" : "",
    Overdue: f.overdue ? "Yes" : "",
    "High intent": f.highIntent ? "Yes" : "",
    Channel: f.channel ? labelOf(CHANNEL_LABEL, f.channel) : "",
    Status: humanize(f.status),
    Owner: f.ownerId === "unassigned" ? "Unassigned" : f.ownerId ? "Selected owner" : "",
  }),
  async load(context, filters) {
    const businessId = context.businessId;
    const [queue, employees, myEmployeeId] = await Promise.all([
      listConversationQueueForExport(businessId),
      listEmployeeOptions(businessId),
      getCurrentEmployeeId(businessId),
    ]);
    const rows = applyConversationQueueFilters(
      queue,
      {
        needsResponse: filters.needsResponse,
        assignedToMe: filters.assignedToMe,
        overdue: filters.overdue,
        highIntent: filters.highIntent,
        channel: filters.channel || undefined,
        status: filters.status || undefined,
        ownerId: filters.ownerId || undefined,
      },
      myEmployeeId,
    );

    const selectedId = filters.conversationId || rows[0]?.id;
    const selected = selectedId ? await getConversationMessagesForExport(businessId, selectedId) : null;
    if (filters.conversationId && !selected) throw new ExportDeniedError("Conversation not found.", 404);

    let messages: MessageRow[] = [];
    if (selected) {
      const party = selected.conversation.party_id
        ? (await listPartiesForExport(businessId, [selected.conversation.party_id])).get(selected.conversation.party_id)
        : undefined;
      const contact = party?.name ?? "Unknown contact";
      messages = selected.messages.map((m) => ({
        ...m,
        sender: m.direction === "inbound" ? contact : context.businessName,
        recipient: m.direction === "inbound" ? context.businessName : contact,
      }));
    }

    const employeeById = employeeMap(employees);
    return {
      module: "crm",
      resource: "conversations",
      title: "CRM conversations",
      csvSheet: filters.conversationId ? "Messages" : undefined,
      sheets: [
        {
          sheetName: "Conversations",
          columns: [
            { key: "contact", header: "Contact", getValue: (r: ConversationQueueRow) => r.partyName ?? "Unknown contact" },
            { key: "channel", header: "Channel", getValue: (r: ConversationQueueRow) => labelOf(CHANNEL_LABEL, r.primary_channel) },
            { key: "status", header: "Status", getValue: (r: ConversationQueueRow) => humanize(r.status) },
            { key: "owner", header: "Owner", getValue: (r: ConversationQueueRow) => ownerName(employeeById, r.assigned_to) },
            { key: "needs_response", header: "Needs response", type: "boolean", getValue: (r: ConversationQueueRow) => r.needsResponse },
            { key: "overdue", header: "Overdue", type: "boolean", getValue: (r: ConversationQueueRow) => r.overdue },
            { key: "high_intent", header: "High intent", type: "boolean", getValue: (r: ConversationQueueRow) => r.highIntent },
            { key: "last_interaction", header: "Last interaction", type: "datetime", getValue: (r: ConversationQueueRow) => r.last_interaction_at },
            { key: "created", header: "Created", type: "datetime", getValue: (r: ConversationQueueRow) => r.created_at },
          ],
          rows,
        },
        {
          sheetName: "Messages",
          columns: [
            { key: "timestamp", header: "Timestamp", type: "datetime", getValue: (m: MessageRow) => m.occurred_at },
            { key: "direction", header: "Direction", getValue: (m: MessageRow) => humanize(m.direction) },
            { key: "channel", header: "Channel", getValue: (m: MessageRow) => labelOf(CHANNEL_LABEL, m.channel) },
            { key: "sender", header: "Sender", getValue: (m: MessageRow) => m.sender },
            { key: "recipient", header: "Recipient", getValue: (m: MessageRow) => m.recipient },
            { key: "type", header: "Message type", getValue: (m: MessageRow) => humanize(m.interaction_type) },
            {
              key: "delivery",
              header: "Delivery status",
              getValue: (m: MessageRow) =>
                m.direction === "outbound" && m.channel === "whatsapp" ? (m.status === "failed" ? "Failed" : humanize(m.provider_status)) : "",
            },
            { key: "text", header: "Message text", getValue: (m: MessageRow) => m.content_excerpt ?? "" },
          ],
          rows: messages,
        },
      ],
    };
  },
};
