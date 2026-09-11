import Link from "next/link";
import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { listPotentialLostBusinessQueue } from "@cofounderai/module-crm/lib/interactions/queries";
import { formatAge } from "@cofounderai/module-crm/lib/interactions/lost-business";
import { listEmployeeOptions } from "@cofounderai/module-crm/lib/tickets/queries";
import { Badge } from "@cofounderai/core/ui/badge";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { AlertTriangle } from "lucide-react";

/**
 * CRM-09.2's "Potential Lost Business Queue" -- the backlog's own framing: "a primary
 * dashboard, not a hidden report," meant to feel like "here is the business I might lose
 * today," not a contact database. Shows the backlog's exact column list (age, person/
 * company, channel, message excerpt, intent, related product, opportunity value if
 * known, owner, SLA status); `intent` and `related product` render as an em dash until
 * CRM-09.3/CRM-10.1 exist to populate them (see lost-business.ts's own doc comment on
 * why those stay honestly empty rather than fabricated). No actions here yet --
 * "Respond / Create Lead / Create Opportunity / Create Task / Not Relevant" is CRM-09.5's
 * own story, this one is read-only visibility per its own acceptance criteria.
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
                  <span>{row.opportunityValue ? `${row.opportunityCurrency ?? "INR"} ${row.opportunityValue}` : "—"}</span>
                  <Badge variant={row.ownerId ? "secondary" : "outline"}>{employeeById.get(row.ownerId ?? "")?.full_name ?? "Unassigned"}</Badge>
                </div>
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
                <TableHead className="text-right">SLA</TableHead>
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
                  <TableCell className="text-muted-foreground">{row.intent ?? "—"}</TableCell>
                  <TableCell>{row.opportunityValue ? `${row.opportunityCurrency ?? "INR"} ${row.opportunityValue}` : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={row.ownerId ? "secondary" : "outline"}>{employeeById.get(row.ownerId ?? "")?.full_name ?? "Unassigned"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={row.overdue ? "destructive" : "outline"}>{row.overdue ? "Overdue" : "On track"}</Badge>
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
