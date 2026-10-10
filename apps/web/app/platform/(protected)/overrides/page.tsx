import {
  listBusinessOptions,
  listBusinessOverrides,
  type BusinessOverride,
  type OverrideStatus,
} from "@cofounderai/core/admin/platform-business-overrides";
import { RESOURCE_LABELS } from "@cofounderai/core/admin/platform-limits-constants";
import { Badge } from "@cofounderai/core/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@cofounderai/core/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { EmptyState, Panel, formatWhen } from "../billing/billing-ui";
import { NewOverrideDialog, RevokeOverrideDialog } from "./override-dialogs";

/**
 * PLATFORM-P1-02.1 (Business Override), PLATFORM-P1-02.2 (Temporary Entitlement) and
 * PLATFORM-P1-02.3 (Override Audit), docs/plan/09-PLATFORM-ADMIN-PORTAL-BACKLOG.md §24.
 * Current and upcoming overrides first, each with one action (Revoke); ended ones folded.
 * Every create and revoke also shows in Audit Search as "Business Override".
 */

const STATUS: Record<OverrideStatus, { label: string; variant: "success" | "secondary" | "outline" }> = {
  active: { label: "Active", variant: "success" },
  scheduled: { label: "Scheduled", variant: "secondary" },
  expired: { label: "Expired", variant: "outline" },
  revoked: { label: "Revoked", variant: "outline" },
};

const ROW = "border-zinc-800 hover:bg-zinc-900/60";
const HEAD_ROW = "border-zinc-800 hover:bg-transparent";
const HEAD = "text-zinc-400";

function limitText(o: BusinessOverride): string {
  return o.state === "unlimited" ? "Unlimited" : `Up to ${o.limitValue}`;
}

function windowText(o: BusinessOverride): string {
  return `${formatWhen(o.startsAt)} → ${formatWhen(o.expiresAt)}`;
}

function OverrideList({ overrides, showAction }: { overrides: BusinessOverride[]; showAction: boolean }) {
  return (
    <>
      <ul className="flex flex-col divide-y divide-zinc-800 md:hidden">
        {overrides.map((o) => (
          <li key={o.id} className="flex flex-col gap-1 py-2.5 text-sm first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-zinc-100">{o.businessName ?? "Unknown business"}</span>
              <Badge variant={STATUS[o.status].variant}>{STATUS[o.status].label}</Badge>
            </div>
            <span className="text-zinc-300">
              {RESOURCE_LABELS[o.resourceKey]}: {limitText(o)}
            </span>
            <span className="text-xs text-zinc-400">{windowText(o)}</span>
            <span className="text-xs text-zinc-500">
              {o.status === "revoked" ? `Revoked: ${o.revokeReason}` : o.reason} · {o.createdByEmail ?? "Unknown admin"}
            </span>
            {showAction ? (
              <div>
                <RevokeOverrideDialog id={o.id} label={`${o.businessName ?? "This business"}, ${RESOURCE_LABELS[o.resourceKey]}`} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow className={HEAD_ROW}>
            <TableHead className={HEAD}>Business</TableHead>
            <TableHead className={HEAD}>Resource</TableHead>
            <TableHead className={HEAD}>Limit</TableHead>
            <TableHead className={HEAD}>Window</TableHead>
            <TableHead className={HEAD}>Reason</TableHead>
            <TableHead className={HEAD}>Status</TableHead>
            {showAction ? <TableHead className={HEAD} /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {overrides.map((o) => (
            <TableRow key={o.id} className={ROW}>
              <TableCell className="font-medium text-zinc-100">{o.businessName ?? "Unknown business"}</TableCell>
              <TableCell className="text-zinc-300">{RESOURCE_LABELS[o.resourceKey]}</TableCell>
              <TableCell className="text-zinc-300">{limitText(o)}</TableCell>
              <TableCell className="text-xs text-zinc-400">{windowText(o)}</TableCell>
              <TableCell className="max-w-64 text-xs text-zinc-400">
                {o.reason}
                {o.revokeReason ? <span className="block text-zinc-500">Revoked: {o.revokeReason}</span> : null}
                <span className="block text-zinc-500">{o.createdByEmail ?? "Unknown admin"}</span>
              </TableCell>
              <TableCell>
                <Badge variant={STATUS[o.status].variant}>{STATUS[o.status].label}</Badge>
              </TableCell>
              {showAction ? (
                <TableCell className="text-right">
                  <RevokeOverrideDialog id={o.id} label={`${o.businessName ?? "This business"}, ${RESOURCE_LABELS[o.resourceKey]}`} />
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

export default async function BusinessOverridesPage() {
  const [overrides, businesses] = await Promise.all([listBusinessOverrides(), listBusinessOptions()]);
  const current = overrides.filter((o) => o.status === "active" || o.status === "scheduled");
  const ended = overrides.filter((o) => o.status === "expired" || o.status === "revoked");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Business Overrides</h1>
          <p className="text-sm text-zinc-400">A different limit for one business, for a fixed time. Ends on its own at expiry.</p>
        </div>
        <NewOverrideDialog businesses={businesses} />
      </div>

      <Panel title="Current" description={current.length > 0 ? `${current.length} active or scheduled` : undefined}>
        {current.length > 0 ? <OverrideList overrides={current} showAction /> : <EmptyState>No active or scheduled overrides. Every business is on its plan&apos;s limits.</EmptyState>}
      </Panel>

      {ended.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger className="text-xs text-zinc-400 hover:text-zinc-200">Ended ({ended.length})</CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <Panel title="Ended">
              <OverrideList overrides={ended} showAction={false} />
            </Panel>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}
