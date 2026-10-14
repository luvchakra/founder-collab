import Link from "next/link";
import { listOrganizations, type ConsoleOrganization } from "@cofounderai/core/admin/platform-organizations";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@cofounderai/core/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { EmptyState, Panel } from "../billing/billing-ui";
import { StatusBadge } from "./status-badge";

/**
 * PLATFORM-P1-10.10 (Organizations Console), docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §40.
 * Every organization (a root business), with its owner, plan and status, and one action each
 * (Manage). Test organizations are folded apart; decommissioned ones only on request.
 */

export const dynamic = "force-dynamic";

const ROW = "border-zinc-800 hover:bg-zinc-900/60";
const HEAD = "text-zinc-400";

function ownerText(o: ConsoleOrganization) {
  if (o.owners.length === 0) return "No owner";
  const first = o.owners[0]!.name ?? o.owners[0]!.email ?? "Unknown";
  return o.owners.length > 1 ? `${first} +${o.owners.length - 1}` : first;
}

function OrganizationList({ organizations }: { organizations: ConsoleOrganization[] }) {
  return (
    <>
      <ul className="flex flex-col divide-y divide-zinc-800 md:hidden">
        {organizations.map((o) => (
          <li key={o.id} className="flex flex-col gap-1 py-2.5 text-sm first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/platform/organizations/${o.id}`} className="font-medium text-zinc-100 hover:underline">
                {o.name}
              </Link>
              <StatusBadge status={o.status} disabledByOwner={o.disabledByOwner} />
            </div>
            <span className="text-xs text-zinc-400">
              {ownerText(o)} · {o.plan} · {o.environments.length} environment{o.environments.length === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className={HEAD}>Organization</TableHead>
            <TableHead className={`${HEAD} hidden lg:table-cell`}>Owner</TableHead>
            <TableHead className={HEAD}>Plan</TableHead>
            <TableHead className={HEAD}>Status</TableHead>
            <TableHead className={HEAD} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {organizations.map((o) => (
            <TableRow key={o.id} className={ROW}>
              <TableCell className="text-zinc-100">
                {o.name}
                <span className="block text-xs text-zinc-500">
                  {o.environments.length} environment{o.environments.length === 1 ? "" : "s"}
                </span>
              </TableCell>
              <TableCell className="hidden text-zinc-300 lg:table-cell" title={o.owners.map((x) => x.email).filter(Boolean).join(", ")}>
                {ownerText(o)}
              </TableCell>
              <TableCell className="text-zinc-300">{o.plan}</TableCell>
              <TableCell>
                <StatusBadge status={o.status} disabledByOwner={o.disabledByOwner} />
              </TableCell>
              <TableCell className="text-right">
                <Link href={`/platform/organizations/${o.id}`} className="text-sm text-zinc-300 underline-offset-2 hover:underline">
                  Manage
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

export default async function OrganizationsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const showAll = (await searchParams).all === "1";
  const organizations = await listOrganizations({ includeDecommissioned: showAll });
  const customers = organizations.filter((o) => !o.isTest);
  const tests = organizations.filter((o) => o.isTest);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Organizations</h1>
          <p className="text-sm text-zinc-400">Every customer organization and its environments.</p>
        </div>
        <Link href={showAll ? "/platform/organizations" : "/platform/organizations?all=1"} className="text-xs text-zinc-400 underline-offset-2 hover:underline">
          {showAll ? "Hide decommissioned" : "Show decommissioned"}
        </Link>
      </div>
      <Panel title="Customers" description={`${customers.length} organization${customers.length === 1 ? "" : "s"}`}>
        {customers.length > 0 ? <OrganizationList organizations={customers} /> : <EmptyState>No customer organizations yet.</EmptyState>}
      </Panel>
      {tests.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger className="text-xs text-zinc-400 hover:text-zinc-200">Test organizations ({tests.length})</CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <Panel title="Test organizations">
              <OrganizationList organizations={tests} />
            </Panel>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}
