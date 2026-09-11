import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { getOpportunity, listStages, getFsmQuoteStatusForOpportunity } from "@cofounderai/module-crm/lib/opportunities/queries";
import { resolveCommercialJourney, resolveNextCrossModuleAction } from "@cofounderai/module-crm/lib/journey/queries";
import { listOpportunityProducts } from "@cofounderai/module-crm/lib/opportunities/products";
import { listOpportunityContacts } from "@cofounderai/module-crm/lib/opportunities/contacts";
import { getActivity } from "@cofounderai/module-crm/lib/activities/queries";
import { listFollowUpsForOpportunity } from "@cofounderai/module-crm/lib/follow-ups/queries";
import { listEmployeeOptions } from "@cofounderai/module-crm/lib/tickets/queries";
import { getParty, listContactsForParty } from "@cofounderai/core/parties/queries";
import { listItemsForBusiness } from "@cofounderai/core/items/queries";
import { hasModule } from "@cofounderai/core/licensing/queries";
import { formatDate, inr } from "@cofounderai/core/lib/format";
import { Badge } from "@cofounderai/core/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Input } from "@cofounderai/core/ui/input";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { CalendarClock, CheckCircle2, ListTodo, Package, Star, Trash2, Users, Wrench } from "lucide-react";
import { EditValueDialog } from "../edit-value-dialog";
import { JourneyBadge } from "../journey-badge";
import { assignOpportunityAction, updateOpportunityValueAction } from "../actions";
import {
  addOpportunityContactAction,
  addOpportunityProductAction,
  completeOpportunityFollowUpAction,
  completeOpportunityNextActionAction,
  createFsmJobAction,
  createFsmQuoteAction,
  createOpportunityFollowUpAction,
  createOpportunityNextActionAction,
  removeOpportunityContactAction,
  removeOpportunityProductAction,
  setPrimaryOpportunityContactAction,
} from "./actions";

const FOLLOW_UP_PRIORITIES = ["low", "normal", "high"] as const;

const ACTIVITY_TYPES = [
  "call", "meeting", "note", "email", "whatsapp", "social", "task", "follow_up", "quote_follow_up", "service_follow_up",
] as const;

/**
 * CRM-04.4's Opportunity detail page -- the first per-opportunity page (List/Kanban
 * views only ever showed row/card summaries). Its reason to exist is the products
 * section below: "Opportunity can reference multiple Inventory products where Inventory
 * is licensed" needs somewhere to live, and a detail page is the natural place per
 * docs/design/claude-ui-design-rules.md rule 1 (a page's own primary content should
 * match what a user came here to do, not be crammed into the list view's row).
 *
 * CRM-04.5 adds the Contacts section below: only shown for a `kind='company'` opportunity
 * party, since a `kind='person'` party has no `core.party_contacts` of its own to pick
 * from (same rule the Customer 360 page's own Contacts section already follows).
 *
 * CRM-05.2 adds the Next Action card right after the header, the most prominent spot on
 * the page per that story's own "prominent next_action" wording. Completing it clears
 * `opportunity.next_action_id` so the add-next-action form reappears in its place --
 * that immediate reappearance is this codebase's answer to "completing an action can
 * prompt creation of the next action," without a separate modal flow.
 *
 * CRM-11.1/11.2/11.3 add the FSM quote card: "Create FSM Quote" seeds an FSM estimate
 * from this opportunity's products; once created, status is always re-read live via
 * `getFsmQuoteStatusForOpportunity()` (never cached on this page), and "Create job in
 * FSM" (the accepted-quote -> job action) appears once an estimate exists with no job
 * yet.
 */
export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; opportunityId: string }>;
}) {
  const { businessId, opportunityId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const opportunity = await getOpportunity(businessId, opportunityId);
  if (!opportunity) notFound();

  const [party, stages, products, contacts, employees, followUps, inventoryLicensed, fsmLicensed, fsmQuoteStatus, journey] = await Promise.all([
    getParty(opportunity.party_id),
    listStages(businessId),
    listOpportunityProducts(businessId, opportunityId),
    listOpportunityContacts(businessId, opportunityId),
    listEmployeeOptions(businessId),
    listFollowUpsForOpportunity(businessId, opportunityId),
    hasModule(businessId, "inventory"),
    hasModule(businessId, "fsm"),
    getFsmQuoteStatusForOpportunity(businessId, opportunity),
    resolveCommercialJourney(businessId, opportunityId),
  ]);
  const crossModuleAction = journey ? resolveNextCrossModuleAction(journey) : null;
  const stage = stages.find((s) => s.id === opportunity.stage_id);
  const nextAction = opportunity.next_action_id ? await getActivity(businessId, opportunity.next_action_id) : null;
  const ownerName = (ownerId: string | null) => employees.find((e) => e.id === ownerId)?.full_name ?? null;

  // ADR-10 degraded mode: no Inventory license means no product catalog to pick from,
  // so items simply isn't fetched rather than fetching and then hiding a populated list.
  const items = inventoryLicensed ? await listItemsForBusiness(businessId) : [];
  const activeItems = items.filter((item) => item.status === "active");

  const companyContacts = party?.kind === "company" ? await listContactsForParty(party.id) : [];
  const linkedContactIds = new Set(contacts.map((c) => c.partyContactId));
  const availableContacts = companyContacts.filter((c) => !linkedContactIds.has(c.id));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <div>
        <Link href={`/dashboard/businesses/${businessId}/crm/opportunities`} className="text-sm text-muted-foreground hover:underline">
          &larr; Back to opportunities
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">
              <Link href={`/dashboard/businesses/${businessId}/crm/customers/${opportunity.party_id}`} className="hover:underline">
                {party?.name ?? "Unknown contact"}
              </Link>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {opportunity.estimated_value ? inr.format(opportunity.estimated_value) : "No estimate"}
              {opportunity.expected_close_date ? ` -- close ${formatDate(opportunity.expected_close_date)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={opportunity.status === "won" ? "secondary" : opportunity.status === "lost" ? "destructive" : "outline"}>
              {stage?.name ?? opportunity.status}
            </Badge>
            <EditValueDialog opportunity={opportunity} action={(formData) => updateOpportunityValueAction(businessId, opportunity.id, formData)} />
          </div>
        </div>

        {/* CRM-05.4: "unassigned items are visible" -- an explicit "Unassigned" option
            shows as the current value rather than a blank select. */}
        <form action={assignOpportunityAction.bind(null, businessId, opportunityId)} className="mt-3 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Owner</span>
          <NativeSelect name="ownerId" defaultValue={opportunity.owner_id ?? ""} className="w-auto">
            <option value="">Unassigned</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name ?? employee.email ?? "Unnamed"}
              </option>
            ))}
          </NativeSelect>
          <SubmitButton size="sm" variant="outline" pendingText="Assigning...">
            Assign
          </SubmitButton>
        </form>
      </div>

      {journey ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Journey</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <JourneyBadge module="Discovery" section={journey.discovery} />
              <JourneyBadge module="CRM" section={journey.crm} />
              <JourneyBadge module="Inventory" section={journey.inventory} />
              <JourneyBadge module="FSM" section={journey.fsm} />
            </div>
            {journey.blockedReason ? <p className="text-sm text-destructive">{journey.blockedReason}</p> : null}
            {crossModuleAction?.primary ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Next:</span>
                <Badge variant={crossModuleAction.primary.enabled ? "default" : "outline"} className="font-normal">
                  {crossModuleAction.primary.label}
                </Badge>
                {!crossModuleAction.primary.enabled && crossModuleAction.primary.disabledReason ? (
                  <span className="text-xs text-muted-foreground">{crossModuleAction.primary.disabledReason}</span>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Next action</CardTitle>
        </CardHeader>
        <CardContent>
          {nextAction ? (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {nextAction.type.replaceAll("_", " ")}
                  </Badge>
                  {nextAction.subject ? <p className="truncate font-medium">{nextAction.subject}</p> : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {nextAction.due_at ? `Due ${formatDate(nextAction.due_at)}` : "No due date"}
                  {" -- "}
                  {ownerName(nextAction.owner_id) ?? "Unassigned"}
                </p>
              </div>
              <form action={completeOpportunityNextActionAction.bind(null, businessId, opportunityId, nextAction.id)}>
                <SubmitButton variant="outline" size="sm" pendingText="Completing...">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  Complete
                </SubmitButton>
              </form>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <EmptyState icon={ListTodo} message="No next action set." />
              <form action={createOpportunityNextActionAction.bind(null, businessId, opportunityId)} className="flex flex-wrap items-end gap-2">
                <div className="flex min-w-32 flex-col gap-1.5">
                  <label htmlFor="type" className="text-xs text-muted-foreground">
                    Type
                  </label>
                  <NativeSelect id="type" name="type" defaultValue="task">
                    {ACTIVITY_TYPES.map((type) => (
                      <option key={type} value={type} className="capitalize">
                        {type.replaceAll("_", " ")}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex min-w-40 flex-1 flex-col gap-1.5">
                  <label htmlFor="subject" className="text-xs text-muted-foreground">
                    Subject
                  </label>
                  <Input id="subject" name="subject" placeholder="e.g. Send pricing" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="dueAt" className="text-xs text-muted-foreground">
                    Due
                  </label>
                  <Input id="dueAt" name="dueAt" type="date" />
                </div>
                <div className="flex min-w-36 flex-col gap-1.5">
                  <label htmlFor="ownerId" className="text-xs text-muted-foreground">
                    Owner
                  </label>
                  <NativeSelect id="ownerId" name="ownerId" defaultValue="">
                    <option value="">Unassigned</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.full_name ?? employee.email ?? "Unnamed"}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <SubmitButton pendingText="Adding...">Add next action</SubmitButton>
              </form>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Follow-ups</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {followUps.length === 0 ? (
            <EmptyState icon={CalendarClock} message="No follow-ups scheduled." />
          ) : (
            <div className="flex flex-col divide-y">
              {followUps.map((followUp) => (
                <div key={followUp.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={followUp.priority === "high" ? "destructive" : "outline"} className="capitalize">
                        {followUp.priority}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Due {formatDate(followUp.due_at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{ownerName(followUp.owner_id) ?? "Unassigned"}</p>
                  </div>
                  <form action={completeOpportunityFollowUpAction.bind(null, businessId, opportunityId, followUp.id)}>
                    <SubmitButton variant="ghost" size="sm">
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                      Complete
                    </SubmitButton>
                  </form>
                </div>
              ))}
            </div>
          )}

          <form
            action={createOpportunityFollowUpAction.bind(null, businessId, opportunityId)}
            className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="followUpDueAt" className="text-xs text-muted-foreground">
                Due
              </label>
              <Input id="followUpDueAt" name="dueAt" type="date" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="priority" className="text-xs text-muted-foreground">
                Priority
              </label>
              <NativeSelect id="priority" name="priority" defaultValue="normal">
                {FOLLOW_UP_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority} className="capitalize">
                    {priority}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex min-w-36 flex-col gap-1.5">
              <label htmlFor="followUpOwnerId" className="text-xs text-muted-foreground">
                Owner
              </label>
              <NativeSelect id="followUpOwnerId" name="ownerId" defaultValue="">
                <option value="">Unassigned</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name ?? employee.email ?? "Unnamed"}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <SubmitButton pendingText="Adding...">Add follow-up</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {inventoryLicensed ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Products</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {products.length === 0 ? (
              <EmptyState icon={Package} message="No products linked to this opportunity yet." />
            ) : (
              <div className="flex flex-col divide-y">
                {products.map((product) => (
                  <div key={product.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{product.itemName}</p>
                      <p className="text-xs text-muted-foreground">
                        {product.quantity ? `Qty ${product.quantity}` : "No quantity"} &middot; {inr.format(product.unitPrice)} each
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-medium">{product.lineValue ? inr.format(product.lineValue) : "--"}</span>
                      <form action={removeOpportunityProductAction.bind(null, businessId, opportunityId, product.id)}>
                        <SubmitButton variant="ghost" size="sm">
                          <Trash2 className="size-4" aria-hidden="true" />
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeItems.length > 0 ? (
              <form
                action={addOpportunityProductAction.bind(null, businessId, opportunityId)}
                className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
              >
                <div className="flex min-w-40 flex-1 flex-col gap-1.5">
                  <label htmlFor="itemId" className="text-xs text-muted-foreground">
                    Product
                  </label>
                  <NativeSelect id="itemId" name="itemId" defaultValue="">
                    <option value="" disabled>
                      Select a product
                    </option>
                    {activeItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex w-24 flex-col gap-1.5">
                  <label htmlFor="quantity" className="text-xs text-muted-foreground">
                    Quantity
                  </label>
                  <Input id="quantity" name="quantity" type="number" min={0} step="0.01" />
                </div>
                <SubmitButton pendingText="Adding...">Add product</SubmitButton>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {fsmLicensed ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">FSM quote</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!opportunity.fsm_opportunity_id ? (
              <div className="flex flex-col gap-3">
                <EmptyState icon={Wrench} message="No FSM quote created for this opportunity yet." />
                <form action={createFsmQuoteAction.bind(null, businessId, opportunityId)}>
                  <SubmitButton pendingText="Creating..." disabled={products.length === 0}>
                    Create FSM quote
                  </SubmitButton>
                </form>
                {products.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Add at least one product above before creating a quote.</p>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline" className="capitalize">
                    Quote {fsmQuoteStatus?.estimateStatus ?? fsmQuoteStatus?.opportunityStatus ?? "pending"}
                  </Badge>
                  {fsmQuoteStatus?.jobStatus ? (
                    <Badge variant="secondary" className="capitalize">
                      Job {fsmQuoteStatus.jobStatus}
                    </Badge>
                  ) : null}
                </div>
                {fsmQuoteStatus?.estimateId && !fsmQuoteStatus.jobId ? (
                  <form action={createFsmJobAction.bind(null, businessId, opportunityId)}>
                    <SubmitButton pendingText="Creating job...">Create job in FSM</SubmitButton>
                  </form>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {party?.kind === "company" ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Contacts</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {contacts.length === 0 ? (
              <EmptyState icon={Users} message="No contacts linked to this opportunity yet." />
            ) : (
              <div className="flex flex-col divide-y">
                {contacts.map((contact) => (
                  <div key={contact.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{contact.name}</p>
                        {contact.isPrimary ? <Badge variant="secondary">Primary</Badge> : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {[contact.jobTitle, contact.role, contact.email ?? contact.phone].filter(Boolean).join(" -- ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!contact.isPrimary ? (
                        <form action={setPrimaryOpportunityContactAction.bind(null, businessId, opportunityId, contact.id)}>
                          <SubmitButton variant="ghost" size="sm" title="Make primary">
                            <Star className="size-4" aria-hidden="true" />
                          </SubmitButton>
                        </form>
                      ) : null}
                      <form action={removeOpportunityContactAction.bind(null, businessId, opportunityId, contact.id)}>
                        <SubmitButton variant="ghost" size="sm">
                          <Trash2 className="size-4" aria-hidden="true" />
                        </SubmitButton>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {availableContacts.length > 0 ? (
              <form
                action={addOpportunityContactAction.bind(null, businessId, opportunityId)}
                className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
              >
                <div className="flex min-w-40 flex-1 flex-col gap-1.5">
                  <label htmlFor="partyContactId" className="text-xs text-muted-foreground">
                    Contact
                  </label>
                  <NativeSelect id="partyContactId" name="partyContactId" defaultValue="">
                    <option value="" disabled>
                      Select a contact
                    </option>
                    {availableContacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {[contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unnamed contact"}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <SubmitButton pendingText="Adding...">Add contact</SubmitButton>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
