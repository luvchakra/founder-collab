import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAccount, listBusinesses } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listAuditLogForBusiness, verifyAuditChain } from "@cofounderai/core/audit/queries";
import { getClosedThrough, hasPermission } from "@cofounderai/core/finance/controls";
import { Badge } from "@cofounderai/core/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cofounderai/core/ui/table";
import { CloseBooksForm, ReopenBooksForm } from "@/components/settings/period-close-forms";
import { closeBooksAction, reopenBooksAction } from "./actions";

/**
 * Evidence page for the financial controls in 20260908100000_core_financial_controls.sql:
 * the audit trail (gated on audit.view), its hash-chain integrity check, and the
 * period-close date with close/reopen (each gated on its own permission -- SoD).
 */
export default async function AuditSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string }>;
}) {
  const account = await getCurrentAccount();
  if (!account) redirect("/login");
  const businesses = await listBusinesses(account.id);
  const { business: requested } = await searchParams;
  const business = businesses.find((b) => b.id === requested) ?? businesses[0];

  if (!business) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
        <h1 className="text-xl font-semibold">Audit &amp; controls</h1>
        <p className="text-sm text-muted-foreground">Create a business first.</p>
      </main>
    );
  }

  const [canView, canClose, canReopen, closedThrough] = await Promise.all([
    hasPermission(business.id, "audit.view"),
    hasPermission(business.id, "finance.close_period"),
    hasPermission(business.id, "finance.reopen_period"),
    getClosedThrough(business.id),
  ]);
  const [verification, entries] = canView
    ? await Promise.all([verifyAuditChain(business.id), listAuditLogForBusiness(business.id, undefined, 100)])
    : [null, []];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">Audit &amp; controls</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A tamper-evident record of every financial, access and licensing change, and the
          period-close date that locks your books.
        </p>
      </div>

      {businesses.length > 1 ? (
        <nav className="flex flex-wrap gap-2">
          {businesses.map((b) => (
            <Link
              key={b.id}
              href={`/dashboard/settings/audit?business=${b.id}`}
              className={`rounded-md border px-3 py-1 text-sm ${b.id === business.id ? "bg-accent font-medium" : ""}`}
            >
              {b.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <section className="flex flex-col gap-4 rounded-md border p-4">
        <h2 className="font-medium">Period close</h2>
        <p className="text-sm text-muted-foreground">
          {closedThrough
            ? `Books are closed through ${closedThrough}. Documents and payments dated on or before it can't be created, changed or deleted.`
            : "No period is closed yet."}
        </p>
        {canClose ? <CloseBooksForm action={closeBooksAction.bind(null, business.id)} /> : null}
        {canReopen && closedThrough ? (
          <ReopenBooksForm action={reopenBooksAction.bind(null, business.id)} />
        ) : null}
        {!canClose && !canReopen ? (
          <p className="text-xs text-muted-foreground">Your role can&apos;t close or reopen periods.</p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 rounded-md border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Audit log</h2>
          {verification ? (
            verification.valid ? (
              <Badge>Integrity verified · {verification.entries_checked} entries</Badge>
            ) : (
              <Badge variant="destructive">
                Integrity check failed at #{verification.first_invalid_seq}: {verification.reason}
              </Badge>
            )
          ) : null}
        </div>

        {!canView ? (
          <p className="text-sm text-muted-foreground">
            Your role doesn&apos;t include audit.view. Ask an owner or admin.
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Actor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="tabular-nums">{entry.seq}</TableCell>
                  <TableCell className="whitespace-nowrap">{new Date(entry.created_at).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                  <TableCell className="text-xs">{entry.entity_type}</TableCell>
                  <TableCell className="font-mono text-xs">{entry.actor_id?.slice(0, 8) ?? "system"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </main>
  );
}
