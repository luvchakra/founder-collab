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
import { getProspectSummaryForParty } from "@cofounderai/module-discovery/contract/index";
import { listRecentOrdersForParty } from "@cofounderai/module-inventory/contract/index";
import { listRecentJobsForParty } from "@cofounderai/module-fsm/contract/index";
import { getGstDocumentStatus } from "@cofounderai/module-gst/contract/index";
import { linkTicketToDocumentAction } from "./actions";

/**
 * Customer 360 (docs/design/crm-module-design.md Part B, B1) -- one panel pulling
 * live status from every licensed module for a single core.parties row, not a
 * static CRM-only record. Each section calls that module's own contract directly
 * (apps/web is the composition root exempt from the module-to-module contract-only
 * restriction, same reasoning the platform dashboard's own computeModuleWidgets
 * already established) and simply doesn't render if MODULE_NOT_LICENSED comes back --
 * ADR-10's degraded mode, not an error state.
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

  const [prospectResult, ordersResult, jobsResult, aging, ticket] = await Promise.all([
    getProspectSummaryForParty(businessId, partyId),
    listRecentOrdersForParty(businessId, partyId),
    listRecentJobsForParty(businessId, partyId),
    listAgingForParty(businessId, partyId),
    ticketId ? getTicket(ticketId) : Promise.resolve(null),
  ]);

  const totalOutstanding = aging.reduce((sum, row) => sum + Number(row.balance_amount), 0);

  // GST e-invoice/e-way-bill status, chained from whichever invoice-kind document
  // Inventory's own list already returned -- getGstDocumentStatus() is reused exactly
  // as-is (S-2's own contract, no new gst-side code needed for this panel).
  const invoiceIds =
    ordersResult.ok ? ordersResult.data.filter((o) => o.kind === "invoice").map((o) => o.id) : [];
  const gstStatuses = await Promise.all(
    invoiceIds.map((documentId) => getGstDocumentStatus(businessId, documentId).then((r) => ({ documentId, result: r }))),
  );

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
      </div>

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

      {prospectResult.ok && prospectResult.data ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Discovery</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{prospectResult.data.productName}</span>
            <div className="flex gap-2">
              <Badge variant="outline">{prospectResult.data.status}</Badge>
              <Badge variant={prospectResult.data.outcome === "won" ? "secondary" : "outline"}>
                {prospectResult.data.outcome}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {ordersResult.ok ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Inventory</CardTitle>
          </CardHeader>
          <CardContent>
            {ordersResult.data.length === 0 ? (
              <EmptyState variant="inline" message="No orders or invoices yet." />
            ) : (
              <div className="flex flex-col divide-y">
                {ordersResult.data.map((order) => {
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
            )}
          </CardContent>
        </Card>
      ) : null}

      {jobsResult.ok ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Service</CardTitle>
          </CardHeader>
          <CardContent>
            {jobsResult.data.length === 0 ? (
              <EmptyState variant="inline" message="No jobs yet." />
            ) : (
              <div className="flex flex-col divide-y">
                {jobsResult.data.map((job) => {
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
            )}
          </CardContent>
        </Card>
      ) : null}

      {!prospectResult.ok && !ordersResult.ok && !jobsResult.ok && aging.length === 0 ? (
        <EmptyState message="Nothing to show yet -- no module has activity for this customer." />
      ) : null}
    </div>
  );
}
