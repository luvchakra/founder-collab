import { listBusinessOverrides, listOverrideBusinessOptions, type BusinessOverride } from "@cofounderai/core/admin/platform-business-overrides";
import { listFeatures } from "@cofounderai/core/admin/platform-plan-features";
import { RESOURCE_KEYS } from "@cofounderai/core/entitlements/resource-keys";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { ReasonActionDialog } from "../../reason-action-dialog";
import { formatWhen } from "../billing/billing-ui";
import { revokeBusinessOverrideAction } from "./actions";
import { CreateOverrideDialog } from "./create-override-dialog";

/**
 * PLATFORM-P1-02.1/02.2/02.3 ("Business-Level Exceptions", §24) -- every temporary
 * exception a superadmin has granted, active or not (nothing is ever deleted, so the list
 * is also the override history; each grant and revoke is in Audit Search too). Desktop
 * table, mobile stacked list (PLATFORM-P0-19.3/19.4).
 */
export default async function PlatformBusinessOverridesPage() {
  const [overrides, businesses, features] = await Promise.all([listBusinessOverrides(), listOverrideBusinessOptions(), listFeatures()]);
  const featureOptions = features.map((f) => ({ value: `${f.moduleKey}.${f.key}`, label: `${f.name} (${f.moduleKey})` }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Business Exceptions</h1>
          <p className="text-sm text-zinc-400">
            Temporary, per-business overrides of a plan&apos;s limits or features. Every exception has a reason, a grantor, a
            start and an expiry; a licence is never overridden.
          </p>
        </div>
        <CreateOverrideDialog businesses={businesses} features={featureOptions} resourceKeys={RESOURCE_KEYS} />
      </div>

      <div className="rounded-2xl border border-zinc-800">
        {overrides.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">No exceptions granted yet.</p>
        ) : (
          <>
            <ul className="divide-y divide-zinc-800 md:hidden">
              {overrides.map((o) => (
                <li key={o.id} className="flex flex-col gap-1.5 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-100">{o.businessName}</p>
                      <p className="text-xs text-zinc-400">{describe(o)}</p>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="text-xs text-zinc-500">
                    {formatWhen(o.startsAt)} → {formatWhen(o.expiresAt)} · by {o.createdByLabel}
                  </p>
                  <p className="text-xs text-zinc-400">{o.reason}</p>
                  {o.status === "active" || o.status === "scheduled" ? <RevokeButton o={o} /> : null}
                </li>
              ))}
            </ul>
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Business</TableHead>
                  <TableHead className="text-zinc-400">Exception</TableHead>
                  <TableHead className="text-zinc-400">Window</TableHead>
                  <TableHead className="text-zinc-400">Reason</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                  <TableHead className="text-right text-zinc-400">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overrides.map((o) => (
                  <TableRow key={o.id} className="border-zinc-800 hover:bg-zinc-900/60">
                    <TableCell className="text-zinc-100">{o.businessName}</TableCell>
                    <TableCell className="text-zinc-300">{describe(o)}</TableCell>
                    <TableCell className="text-xs text-zinc-400">
                      {formatWhen(o.startsAt)}
                      <span className="block">→ {formatWhen(o.expiresAt)}</span>
                    </TableCell>
                    <TableCell className="max-w-64 text-xs text-zinc-400">
                      <span className="line-clamp-2">{o.reason}</span>
                      <span className="block text-zinc-500">by {o.createdByLabel}</span>
                      {o.revokeReason ? <span className="block text-zinc-500">Revoked: {o.revokeReason}</span> : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={o.status} />
                    </TableCell>
                    <TableCell className="text-right">{o.status === "active" || o.status === "scheduled" ? <RevokeButton o={o} /> : null}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </div>
    </div>
  );
}

function describe(o: BusinessOverride): string {
  if (o.overrideType === "feature") return `Feature: ${o.target}`;
  return `${o.target.replace(/_/g, " ")} limit: ${o.limitValue === null ? "unlimited" : o.limitValue.toLocaleString()}`;
}

function StatusBadge({ status }: { status: BusinessOverride["status"] }) {
  if (status === "active") return <Badge>Active</Badge>;
  if (status === "scheduled") return <Badge variant="secondary">Scheduled</Badge>;
  if (status === "revoked") return <Badge variant="destructive">Revoked</Badge>;
  return <Badge variant="secondary">Expired</Badge>;
}

function RevokeButton({ o }: { o: BusinessOverride }) {
  return (
    <ReasonActionDialog
      trigger={
        <Button variant="ghost" size="sm" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
          Revoke
        </Button>
      }
      title="Revoke this exception?"
      description={`${o.businessName} goes back to its plan's ${o.overrideType === "limit" ? "limit" : "features"} immediately.`}
      confirmLabel="Revoke"
      destructive
      successMessage="Exception revoked."
      action={revokeBusinessOverrideAction.bind(null, o.id)}
    />
  );
}
