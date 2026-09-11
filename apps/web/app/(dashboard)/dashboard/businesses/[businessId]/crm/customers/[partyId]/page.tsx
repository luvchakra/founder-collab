import Link from "next/link";
import { notFound } from "next/navigation";
import { getParty } from "@cofounderai/core/parties/queries";
import { listAgingForParty } from "@cofounderai/core/payments/queries";
import { inr, formatDate } from "@cofounderai/core/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Badge } from "@cofounderai/core/ui/badge";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { RelatedDocumentButton } from "@cofounderai/module-crm/components/tickets/related-document-button";
import { getTicket } from "@cofounderai/module-crm/lib/tickets/queries";
import { getCustomer360 } from "@cofounderai/module-crm/lib/customer-360/queries";
import { getGstDocumentStatus } from "@cofounderai/module-gst/contract/index";
import { linkTicketToDocumentAction } from "./actions";

/**
 * Customer 360 (docs/design/crm-module-design.md Part B, B1 + CRM-02.1). One panel
 * pulling live status from every licensed module for a single core.parties row, not a
 * static CRM-only record. `getCustomer360()` (lib/customer-360/queries.ts) does the
 * cross-module gathering (Discovery prospect, Inventory orders, FSM jobs) plus the
 * CRM-owned sections this story adds (lifecycle status/owner/source, products of
 * interest, open opportunities, open follow-ups, recent conversations, notes) in one
 * call; this page adds only the two sections that call isn't responsible for --
 * `core.payments` aging (no license gate, core-owned) and GST e-invoice status (apps/web
 * is the composition root exempt from the module-to-module contract-only restriction,
 * same reasoning the platform dashboard's own computeModuleWidgets already established).
 * Each cross-module section simply doesn't render when that module isn't licensed
 * (`MODULE_NOT_LICENSED`/empty array is ADR-10's degraded mode, not an error state).
 *
 * The ticket-linking controls (`?ticketId=`, `RelatedDocumentButton`) are untouched --
 * that's the existing ticket model's own interop, not something this story's new
 * lead/opportunity/conversation sections replace (docs/design/crm-backlog-audit.md's
 * incremental-retirement plan: tickets retire story-by-story, not in one cutover).
 */
export default async function CustomerPanelPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; partyId: string }>;
  searchParams: Promise<{ ticketId?: string }>;
}) {
  const { businessId, partyId } = await params;
  const { ticketId } = await searchParams;
  const party = await getParty(partyId);
  if (!party || party.business_id !== businessId) notFound();

  const [customer360, aging, ticket] = await Promise.all([
    getCustomer360(businessId, partyId),
    listAgingForParty(businessId, partyId),
    ticketId ? getTicket(ticketId) : Promise.resolve(null),
  ]);

  const totalOutstanding = aging.reduce((sum, row) => sum + Number(row.balance_amount), 0);

  // GST e-invoice/e-way-bill status, chained from whichever invoice-kind document
  // Inventory's own list already returned -- getGstDocumentStatus() is reused exactly
  // as-is (S-2's own contract, no new gst-side code needed for this panel).
  const invoiceIds = customer360.recentOrders.filter((o) => o.kind === "invoice").map((o) => o.id);
  const gstStatuses = await Promise.all(
    invoiceIds.map((documentId) => getGstDocumentStatus(businessId, documentId).then((r) => ({ documentId, result: r }))),
  );

  const hasAnyCrossModuleData =
    customer360.prospect || customer360.recentOrders.length > 0 || customer360.recentJobs.length > 0 || aging.length > 0;
  const hasAnyCrmData =
    customer360.openLeads.length > 0 ||
    customer360.openOpportunities.length > 0 ||
    customer360.openFollowUps.length > 0 ||
    customer360.recentConversations.length > 0 ||
    customer360.productsOfInterest.length > 0 ||
    customer360.notes.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <div>
        <Link href={`/dashboard/businesses/${businessId}/crm`} className="text-sm text-muted-foreground hover:underline">
          &larr; Back to inbox
        </Link>
        <h1 className="mt-2 text-xl font-semibold">{party.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {party.email ?? party.phone ?? "No contact details on file"}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {customer360.lifecycleStatus ? <Badge variant="outline">{customer360.lifecycleStatus}</Badge> : null}
          {customer360.source ? <Badge variant="outline">Source: {customer360.source}</Badge> : null}
        </div>
      </div>

      {customer360.openOpportunities.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Open opportunities</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {customer360.openOpportunities.map((opportunity) => (
              <div key={opportunity.id} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-muted-foreground">Opened {formatDate(opportunity.createdAt)}</span>
                <Badge variant="outline">{opportunity.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {customer360.openFollowUps.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Open follow-ups</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {customer360.openFollowUps.map((followUp) => (
              <div key={followUp.id} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-muted-foreground">Due {formatDate(followUp.due_at)}</span>
                <Badge variant="outline">{followUp.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {customer360.productsOfInterest.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Products of interest</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {customer360.productsOfInterest.map((interest) => (
              <div key={interest.id} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-muted-foreground">{interest.itemName}</span>
                {interest.quantity ? <span className="font-medium">Qty {interest.quantity}</span> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {customer360.recentConversations.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent conversations</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {customer360.recentConversations.map((conversation) => (
              <div key={conversation.id} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-muted-foreground">
                  {conversation.primaryChannel}
                  {conversation.lastInteractionAt ? ` -- ${formatDate(conversation.lastInteractionAt)}` : ""}
                </span>
                <Badge variant="outline">{conversation.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {customer360.notes.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {customer360.notes.map((note) => (
              <p key={note.id} className="py-1.5 text-sm text-muted-foreground">
                {note.body}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {aging.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Outstanding balance</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-2xl font-semibold">{inr.format(totalOutstanding)}</p>
            <div className="flex flex-col divide-y">
              {aging.map((row) => (
                <div key={row.document_id} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-muted-foreground">
                    {row.doc_type} {row.number} -- due {formatDate(row.due_date)}
                  </span>
                  <span className="font-medium">{inr.format(Number(row.balance_amount))}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {customer360.prospect ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Discovery</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{customer360.prospect.productName}</span>
            <div className="flex gap-2">
              <Badge variant="outline">{customer360.prospect.status}</Badge>
              <Badge variant={customer360.prospect.outcome === "won" ? "secondary" : "outline"}>
                {customer360.prospect.outcome}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {customer360.recentOrders.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Inventory</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col divide-y">
              {customer360.recentOrders.map((order) => {
                const gst = gstStatuses.find((g) => g.documentId === order.id)?.result;
                const einvoiceStatus = gst?.ok ? gst.data.einvoice?.status : null;
                const isLinked = ticket?.related_module === "inventory" && ticket.related_document_id === order.id;
                return (
                  <div key={order.id} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-muted-foreground">
                      {order.kind === "invoice" ? "Invoice" : "Order"} {order.number} -- {formatDate(order.orderDate)}
                    </span>
                    <div className="flex items-center gap-2">
                      {einvoiceStatus ? <Badge variant="outline">e-invoice {einvoiceStatus}</Badge> : null}
                      <Badge variant="outline">{order.status}</Badge>
                      <span className="font-medium">{inr.format(order.totalAmount)}</span>
                      {ticket ? (
                        <RelatedDocumentButton
                          linked={isLinked}
                          onLink={() => linkTicketToDocumentAction(businessId, partyId, ticket.id, { module: "inventory", documentId: order.id })}
                          onUnlink={() => linkTicketToDocumentAction(businessId, partyId, ticket.id, null)}
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {customer360.recentJobs.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Service</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col divide-y">
              {customer360.recentJobs.map((job) => {
                const isLinked = ticket?.related_module === "fsm" && ticket.related_document_id === job.id;
                return (
                  <div key={job.id} className="flex items-center justify-between py-1.5 text-sm">
                    <span className="text-muted-foreground">
                      {job.number ? `Job ${job.number}` : "Job"}
                      {job.scheduledAt ? ` -- ${formatDate(job.scheduledAt)}` : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{job.status}</Badge>
                      {ticket ? (
                        <RelatedDocumentButton
                          linked={isLinked}
                          onLink={() => linkTicketToDocumentAction(businessId, partyId, ticket.id, { module: "fsm", documentId: job.id })}
                          onUnlink={() => linkTicketToDocumentAction(businessId, partyId, ticket.id, null)}
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!hasAnyCrossModuleData && !hasAnyCrmData ? (
        <EmptyState message="Nothing to show yet -- no module has activity for this customer." />
      ) : null}
    </div>
  );
}
