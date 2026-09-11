import Link from "next/link";
import { notFound } from "next/navigation";
import { getParty, listContactsForParty } from "@cofounderai/core/parties/queries";
import { listAgingForParty } from "@cofounderai/core/payments/queries";
import { inr, formatDate } from "@cofounderai/core/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Badge } from "@cofounderai/core/ui/badge";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { RelatedDocumentButton } from "@cofounderai/module-crm/components/tickets/related-document-button";
import { getTicket } from "@cofounderai/module-crm/lib/tickets/queries";
import { getCustomer360 } from "@cofounderai/module-crm/lib/customer-360/queries";
import { listRelationshipTimeline } from "@cofounderai/module-crm/lib/timeline/queries";
import { getCustomerSummary } from "@cofounderai/module-crm/lib/ai/customer-summary";
import { getBuyingIntentScore } from "@cofounderai/module-crm/lib/scoring/buying-intent";
import { getGstDocumentStatus } from "@cofounderai/module-gst/contract/index";
import { TrendingUp } from "lucide-react";
import { generateCustomerSummaryAction, linkTicketToDocumentAction, recalculateBuyingIntentScoreAction } from "./actions";
import { CustomerSummaryCard } from "./customer-summary-card";

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
 *
 * CRM-02.2 (Company/Account 360): every section above already filters by `party_id`
 * regardless of `core.parties.kind`, so a `kind='company'` party already gets the same
 * opportunity/interaction/follow-up view a `kind='person'` one does -- B2B and B2C are
 * both the same one panel, not two. The one thing a company party needs that a person
 * one doesn't is its list of contacts (`core.party_contacts`, D-1) -- added below,
 * reusing `listContactsForParty()` directly rather than adding a CRM-side copy.
 *
 * CRM-12.1 adds the AI summary card: generated on an explicit click (never on page
 * load), from the exact same `getCustomer360()` data this page already renders as
 * cards -- see `lib/ai/customer-summary.ts` for the prompt and its own cache.
 *
 * CRM-12.5 adds the Buying Intent card: a deterministic weighted score (never an LLM
 * call -- see `lib/scoring/buying-intent.ts`), each contributing signal shown with its
 * own point value and source evidence, recalculated on an explicit click that writes an
 * audit log entry.
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

  const [customer360, aging, ticket, contacts, timeline, customerSummary, buyingIntentScore] = await Promise.all([
    getCustomer360(businessId, partyId),
    listAgingForParty(businessId, partyId),
    ticketId ? getTicket(ticketId) : Promise.resolve(null),
    party.kind === "company" ? listContactsForParty(partyId) : Promise.resolve([]),
    listRelationshipTimeline(businessId, partyId),
    getCustomerSummary(businessId, partyId),
    getBuyingIntentScore(businessId, partyId),
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
    customer360.notes.length > 0 ||
    contacts.length > 0 ||
    timeline.length > 0;

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

      <CustomerSummaryCard initialSummary={customerSummary} generateAction={generateCustomerSummaryAction.bind(null, businessId, partyId)} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">Buying intent</CardTitle>
          <form action={recalculateBuyingIntentScoreAction.bind(null, businessId, partyId)}>
            <SubmitButton type="submit" size="sm" variant="outline" pendingText="Recalculating...">
              {buyingIntentScore ? "Recalculate" : "Calculate score"}
            </SubmitButton>
          </form>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {buyingIntentScore ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-semibold">{buyingIntentScore.score}</span>
                <span className="text-sm text-muted-foreground">/ 100</span>
                <span className="text-xs text-muted-foreground">Calculated {formatDate(buyingIntentScore.calculatedAt)}</span>
              </div>
              <div className="flex flex-col divide-y">
                {buyingIntentScore.signals
                  .filter((s) => s.evidence)
                  .map((s) => (
                    <div key={s.key} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{s.label}</p>
                        <p className="truncate text-xs text-muted-foreground">{s.evidence}</p>
                      </div>
                      <span className="shrink-0 font-medium">
                        +{s.points}/{s.maxPoints}
                      </span>
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <EmptyState icon={TrendingUp} message="No score calculated yet." />
          )}
        </CardContent>
      </Card>

      {contacts.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Contacts</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {contacts.map((contact) => (
              <div key={contact.id} className="flex items-center justify-between py-1.5 text-sm">
                <span>
                  {[contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unnamed contact"}
                  {contact.job_title ? <span className="text-muted-foreground"> -- {contact.job_title}</span> : null}
                </span>
                <div className="flex items-center gap-2">
                  {contact.is_primary ? <Badge variant="secondary">Primary</Badge> : null}
                  <span className="text-muted-foreground">{contact.email ?? contact.phone ?? ""}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {timeline.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Timeline</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {timeline.map((entry) => {
              const row = (
                <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
                  <div>
                    <p>{entry.label}</p>
                    {entry.detail ? <p className="text-muted-foreground">{entry.detail}</p> : null}
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-muted-foreground">{formatDate(entry.occurredAt)}</span>
                </div>
              );
              return entry.detailHref ? (
                <Link key={entry.id} href={entry.detailHref} className="hover:bg-muted/50">
                  {row}
                </Link>
              ) : (
                <div key={entry.id}>{row}</div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

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
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{customer360.prospect.productName}</span>
              <div className="flex gap-2">
                <Badge variant="outline">{customer360.prospect.status}</Badge>
                <Badge variant={customer360.prospect.outcome === "won" ? "secondary" : "outline"}>
                  {customer360.prospect.outcome}
                </Badge>
              </div>
            </div>
            {customer360.prospect.buyingSignals.length > 0 ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <p className="font-medium">Buying signals</p>
                  {customer360.prospect.researchedAt ? (
                    <span className="text-xs text-muted-foreground">Researched {formatDate(customer360.prospect.researchedAt)}</span>
                  ) : null}
                </div>
                <ul className="list-inside list-disc text-muted-foreground">
                  {customer360.prospect.buyingSignals.map((signal) => (
                    <li key={signal}>{signal}</li>
                  ))}
                </ul>
                <Link
                  href={`/dashboard/businesses/${businessId}/products/${customer360.prospect.productId}/prospects/${customer360.prospect.prospectId}`}
                  className="text-xs text-primary hover:underline"
                >
                  View Discovery research &rarr;
                </Link>
              </div>
            ) : null}

            {/* DISC-OFFER-P0-08.1: "Offering-Aware CRM Handoff" -- read live from
                Discovery's own contract (`ContractOpportunitySummary`), not copied at
                promotion time, so this always reflects the opportunity's current state
                even after the lead exists. */}
            {customer360.prospect.latestOpportunity ? (
              <div className="flex flex-col gap-1 border-t pt-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium">Opportunity</p>
                  <div className="flex gap-2">
                    {customer360.prospect.latestOpportunity.score !== null ? (
                      <Badge variant="secondary">Score {customer360.prospect.latestOpportunity.score}</Badge>
                    ) : (
                      <Badge variant="outline">Insufficient evidence</Badge>
                    )}
                    <Badge variant="outline">{customer360.prospect.latestOpportunity.priority} priority</Badge>
                  </div>
                </div>
                {customer360.prospect.latestOpportunity.whyThem ? (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Why them: </span>
                    {customer360.prospect.latestOpportunity.whyThem}
                  </p>
                ) : null}
                {customer360.prospect.latestOpportunity.whyNow ? (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Why now: </span>
                    {customer360.prospect.latestOpportunity.whyNow}
                  </p>
                ) : null}
                {customer360.prospect.latestOpportunity.recommendedAction ? (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Discovery recommends: </span>
                    {customer360.prospect.latestOpportunity.recommendedAction}
                  </p>
                ) : null}
                {customer360.prospect.latestOpportunity.discoveryDefinitionName ? (
                  <p className="text-xs text-muted-foreground">
                    Surfaced by discovery definition &quot;{customer360.prospect.latestOpportunity.discoveryDefinitionName}&quot;
                  </p>
                ) : null}
              </div>
            ) : null}
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
