import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { listPotentialLostBusinessQueue } from "@cofounderai/module-crm/lib/interactions/queries";
import { formatAge } from "@cofounderai/module-crm/lib/interactions/lost-business";
import { isHighCommercialIntent } from "@cofounderai/module-crm/lib/interactions/intent-classification";
import type { MessageIntent } from "@cofounderai/module-crm/lib/interactions/intent-classification";
import { listEmployeeOptions } from "@cofounderai/module-crm/lib/tickets/queries";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { AlertTriangle } from "lucide-react";
import {
  createLeadFromInteractionAction,
  createOpportunityFromInteractionAction,
  createTaskFromInteractionAction,
  markNotRelevantAction,
  overrideInteractionIntentAction,
} from "./actions";

/**
 * CRM-09.5's exact action set from an unanswered message: `Respond | Create Lead |
 * Create Opportunity | Create Task | Not Relevant`. `Respond` links straight to the
 * conversation (CRM-07.6's reply composer already lives there); `Create Lead`/`Create
 * Opportunity` only show when the sender is a known party (`conversion-actions.ts`'s own
 * "existing party is reused" -- an unmatched sender's tier-5 party creation is CRM-06.4's
 * own territory, not this one's); `Create Task` and `Not Relevant` are always available.
 */
function ActionsRow({ businessId, interactionId, conversationId, partyId }: { businessId: string; interactionId: string; conversationId: string; partyId: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button asChild size="sm" variant="outline">
        <Link href={`/dashboard/businesses/${businessId}/crm/conversations?conversationId=${conversationId}`}>Respond</Link>
      </Button>
      {partyId ? (
        <>
          <form action={createLeadFromInteractionAction.bind(null, businessId, interactionId)}>
            <SubmitButton size="sm" variant="outline" pendingText="Creating...">
              Create Lead
            </SubmitButton>
          </form>
          <form action={createOpportunityFromInteractionAction.bind(null, businessId, interactionId)}>
            <SubmitButton size="sm" variant="outline" pendingText="Creating...">
              Create Opportunity
            </SubmitButton>
          </form>
        </>
      ) : null}
      <form action={createTaskFromInteractionAction.bind(null, businessId, interactionId)}>
        <SubmitButton size="sm" variant="outline" pendingText="Creating...">
          Create Task
        </SubmitButton>
      </form>
      <form action={markNotRelevantAction.bind(null, businessId, interactionId)}>
        <SubmitButton size="sm" variant="ghost" pendingText="Marking...">
          Not Relevant
        </SubmitButton>
      </form>
    </div>
  );
}

const MESSAGE_INTENTS: MessageIntent[] = [
  "pricing",
  "product_question",
  "availability",
  "purchase_intent",
  "appointment",
  "support",
  "complaint",
  "feedback",
  "review",
  "general_enquiry",
  "spam",
];

/** CRM-09.4's "user can override classification" -- an inline edit on the row itself
 * (docs/design/claude-ui-design-rules.md rule 4), same SubmitButton-driven form pattern
 * the Leads page's own inline status editor already uses. */
function IntentForm({ businessId, interactionId, intent }: { businessId: string; interactionId: string; intent: string | null }) {
  return (
    <form action={overrideInteractionIntentAction.bind(null, businessId, interactionId)} className="flex items-center gap-2">
      <NativeSelect name="intent" defaultValue={intent ?? "general_enquiry"} className="w-auto">
        {MESSAGE_INTENTS.map((i) => (
          <option key={i} value={i}>
            {i.replaceAll("_", " ")}
          </option>
        ))}
      </NativeSelect>
      <SubmitButton size="sm" variant="ghost" pendingText="Saving...">
        Correct
      </SubmitButton>
    </form>
  );
}

/**
 * CRM-09.2's "Potential Lost Business Queue" -- the backlog's own framing: "a primary
 * dashboard, not a hidden report," meant to feel like "here is the business I might lose
 * today," not a contact database. Shows the backlog's exact column list (age, person/
 * company, channel, message excerpt, intent, related product, opportunity value if
 * known, owner, SLA status); `related product` renders as an em dash until CRM-10.1
 * exists to populate it (see lost-business.ts's own doc comment on why it stays honestly
 * empty rather than fabricated). `intent` is now real (CRM-09.3) and CRM-09.4 makes high
 * commercial intent (`pricing`/`availability`/`purchase_intent`/`appointment`) visually
 * obvious with a destructive-variant badge, plus an inline correction form since the
 * classifier is a rough guess a human can override. CRM-09.5's action row
 * (`ActionsRow`, above) adds the backlog's exact `Respond | Create Lead | Create
 * Opportunity | Create Task | Not Relevant` set per row.
 *
 * Oldest first (desktop table, cards below `md` per docs/design/claude-ui-design-rules.md
 * rule 5) -- the longest-unanswered message is the most urgent one to see first.
 */
export default async function CrmLostBusinessPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [queue, employees] = await Promise.all([listPotentialLostBusinessQueue(businessId), listEmployeeOptions(businessId)]);
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Potential Lost Business</h1>
        <p className="mt-1 text-sm text-muted-foreground">Unanswered commercial messages {business.name} might lose if nobody replies.</p>
      </div>

      {queue.length === 0 ? (
        <EmptyState icon={AlertTriangle} message="Nothing unanswered right now -- every commercial message has a reply." />
      ) : (
        <div className="rounded-2xl border border-border">
          <ul className="divide-y md:hidden">
            {queue.map((row) => (
              <li key={row.interactionId} className="flex flex-col gap-2 p-3 text-sm">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <Link href={`/dashboard/businesses/${businessId}/crm/customers/${row.partyId ?? ""}`} className="min-w-0 font-medium break-words hover:underline">
                    {row.partyName ?? "Unknown contact"}
                  </Link>
                  <Badge variant={row.overdue ? "destructive" : "outline"} className="shrink-0">
                    {formatAge(row.ageMs)}
                  </Badge>
                </div>
                <p className="text-muted-foreground">{row.contentExcerpt ?? "(no preview)"}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="capitalize">
                    {row.channel}
                  </Badge>
                  {isHighCommercialIntent(row.intent as MessageIntent | null) ? <Badge variant="destructive">High intent</Badge> : null}
                  <span>{row.opportunityValue ? `${row.opportunityCurrency ?? "INR"} ${row.opportunityValue}` : "—"}</span>
                  <Badge variant={row.ownerId ? "secondary" : "outline"}>{employeeById.get(row.ownerId ?? "")?.full_name ?? "Unassigned"}</Badge>
                </div>
                <IntentForm businessId={businessId} interactionId={row.interactionId} intent={row.intent} />
                <ActionsRow businessId={businessId} interactionId={row.interactionId} conversationId={row.conversationId} partyId={row.partyId} />
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Age</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Intent</TableHead>
                <TableHead>Opportunity value</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((row) => (
                <TableRow key={row.interactionId}>
                  <TableCell className="whitespace-nowrap">{formatAge(row.ageMs)}</TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/dashboard/businesses/${businessId}/crm/customers/${row.partyId ?? ""}`} className="hover:underline">
                      {row.partyName ?? "Unknown contact"}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {row.channel}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{row.contentExcerpt ?? "(no preview)"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="capitalize text-muted-foreground">{row.intent?.replaceAll("_", " ") ?? "—"}</span>
                        {isHighCommercialIntent(row.intent as MessageIntent | null) ? <Badge variant="destructive">High intent</Badge> : null}
                      </div>
                      <IntentForm businessId={businessId} interactionId={row.interactionId} intent={row.intent} />
                    </div>
                  </TableCell>
                  <TableCell>{row.opportunityValue ? `${row.opportunityCurrency ?? "INR"} ${row.opportunityValue}` : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={row.ownerId ? "secondary" : "outline"}>{employeeById.get(row.ownerId ?? "")?.full_name ?? "Unassigned"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.overdue ? "destructive" : "outline"}>{row.overdue ? "Overdue" : "On track"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <ActionsRow businessId={businessId} interactionId={row.interactionId} conversationId={row.conversationId} partyId={row.partyId} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
