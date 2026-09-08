import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Badge } from "@cofounderai/core/ui/badge";
import { formatDate, formatDateTime, inr } from "@cofounderai/core/lib/format";
import type { DispatcherDashboard } from "../../lib/dashboard/types";

/**
 * `/fsm`'s own dispatcher dashboard (PRD §5) -- five widget cards, each linking through
 * to the fuller page that actually manages that data (Schedule, Jobs, Invoices,
 * Opportunities). Deliberately no charts/aggregates beyond simple counts -- the PRD
 * describes this as an action queue for a dispatcher's morning, not a KPI page (that's
 * `inventory`'s own dashboard's job, a different design intent).
 */
export function DispatcherDashboardView({ businessId, data }: { businessId: string; data: DispatcherDashboard }) {
  const base = `/dashboard/businesses/${businessId}/fsm`;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Today&apos;s schedule
            <Badge variant="secondary">{data.todaysEvents.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.todaysEvents.length === 0 ? (
            <EmptyState label="Nothing scheduled for today." />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {data.todaysEvents.slice(0, 6).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                  <span className="truncate">
                    {e.subject_label} -- {e.party_name}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{formatDateTime(e.starts_at)}</span>
                </li>
              ))}
            </ul>
          )}
          <ViewAllLink href={`${base}/schedule`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Unassigned queue
            <Badge variant="secondary">{data.unassignedJobs.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.unassignedJobs.length === 0 ? (
            <EmptyState label="No unscheduled jobs." />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {data.unassignedJobs.slice(0, 6).map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                  <span className="truncate">
                    {j.number ?? "Job"} -- {j.party_name}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <ViewAllLink href={`${base}/jobs`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Jobs in progress
            <Badge variant="secondary">{data.jobsInProgress.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.jobsInProgress.length === 0 ? (
            <EmptyState label="No jobs in progress right now." />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {data.jobsInProgress.slice(0, 6).map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                  <span className="truncate">
                    {j.number ?? "Job"} -- {j.party_name}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <ViewAllLink href={`${base}/jobs`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Overdue invoices
            <Badge variant={data.overdueInvoices.length > 0 ? "destructive" : "secondary"}>{data.overdueInvoices.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.overdueInvoices.length === 0 ? (
            <EmptyState label="Nothing overdue." />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {data.overdueInvoices.slice(0, 6).map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                  <span className="truncate">
                    {i.number ?? "Invoice"} -- {i.party_name}
                  </span>
                  <span className="shrink-0 font-medium text-destructive">{inr.format(i.balance_amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <ViewAllLink href={`${base}/invoices`} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Estimates awaiting response
            <Badge variant="secondary">{data.estimatesAwaitingResponse.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.estimatesAwaitingResponse.length === 0 ? (
            <EmptyState label="No estimates waiting on a customer." />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {data.estimatesAwaitingResponse.slice(0, 8).map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                  <span className="truncate">
                    {o.number ?? "Opportunity"} -- {o.party_name}
                  </span>
                  <span className="shrink-0 text-muted-foreground">sent {formatDate(o.updated_at)}</span>
                </li>
              ))}
            </ul>
          )}
          <ViewAllLink href={`${base}/opportunities`} />
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground">{label}</p>;
}

function ViewAllLink({ href }: { href: string }) {
  return (
    <Link href={href} className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
      View all →
    </Link>
  );
}
