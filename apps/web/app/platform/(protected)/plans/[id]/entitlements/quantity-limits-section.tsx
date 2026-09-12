"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { RESOURCE_LABELS, type ResourceKey } from "@cofounderai/core/admin/platform-limits-constants";
import type { LimitState, LimitType, PlanResourceLimit } from "@cofounderai/core/admin/platform-plan-limits";
import { clearPlanLimitAction, setPlanLimitAction } from "./actions";

const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";

type RowDraft = { state: LimitState; limitValue: string; limitType: LimitType };

function draftFrom(limit: PlanResourceLimit): RowDraft {
  if (!limit.configured) return { state: "unlimited", limitValue: "", limitType: "hard" };
  return {
    state: limit.state,
    limitValue: limit.limitValue === null ? "" : String(limit.limitValue),
    // PLATFORM-P0-06.5 decision #2: limitType is only ever real when state='limited';
    // "hard" here for a non-limited row is just this draft's own placeholder default for
    // if/when the superadmin switches the select to "Limited" -- it is never sent to the
    // server for a state other than "limited" (setPlanLimitSchema normalizes it to null
    // regardless).
    limitType: limit.state === "limited" && limit.limitType ? limit.limitType : "hard",
  };
}

/**
 * PLATFORM-P0-04.5/04.6 ("Quantity Limits" + "Unlimited Support") -- one row per resource
 * dimension. Each row is a small two-field form (state + numeric value, shown only for
 * "Limited"), not a single-field toggle like the module entitlements section above it, so
 * it gets its own explicit "Save" per row rather than an instant-flip -- editing two
 * related fields atomically needs a deliberate commit, the same reasoning
 * `branding-form.tsx`'s single "Save" button applies to its own multi-field sections.
 * "Not configured" is rendered as its own honest state (see the migration's own
 * docstring), never silently defaulted to Unlimited or Disabled.
 *
 * PLATFORM-P0-06.5 decision #2: a "Limited" row also carries a Hard/Soft selector,
 * defaulting to Hard (today's unchanged behavior) -- shown only alongside the numeric
 * value, since `limit_type` is meaningless for any other state.
 */
export function QuantityLimitsSection({ planId, limits }: { planId: string; limits: PlanResourceLimit[] }) {
  const [rows, setRows] = useState(limits);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() =>
    Object.fromEntries(limits.map((l) => [l.resourceKey, draftFrom(l)])),
  );
  const [pendingKey, setPendingKey] = useState<ResourceKey | null>(null);
  const [, startTransition] = useTransition();

  function updateDraft(key: ResourceKey, next: Partial<RowDraft>) {
    setDrafts((d) => ({ ...d, [key]: { ...d[key], ...next } }));
  }

  function save(key: ResourceKey) {
    const draft = drafts[key];
    setPendingKey(key);
    startTransition(async () => {
      const result = await setPlanLimitAction(planId, key, draft);
      setPendingKey(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRows((r) =>
        r.map((row) =>
          row.resourceKey === key
            ? {
                resourceKey: key,
                configured: true,
                state: draft.state,
                limitValue: draft.state === "limited" ? Number(draft.limitValue) : null,
                limitType: draft.state === "limited" ? draft.limitType : null,
                updatedAt: new Date().toISOString(),
                updatedBy: null,
              }
            : row,
        ),
      );
      toast.success(`${RESOURCE_LABELS[key]} limit saved.`);
    });
  }

  function clear(key: ResourceKey) {
    setPendingKey(key);
    startTransition(async () => {
      const result = await clearPlanLimitAction(planId, key);
      setPendingKey(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRows((r) => r.map((row) => (row.resourceKey === key ? { resourceKey: key, configured: false } : row)));
      setDrafts((d) => ({ ...d, [key]: { state: "unlimited", limitValue: "", limitType: "hard" } }));
      toast.success(`${RESOURCE_LABELS[key]} reverted to not configured.`);
    });
  }

  function StateBadge({ limit }: { limit: PlanResourceLimit }) {
    if (!limit.configured) return <Badge variant="outline" className="border-zinc-700 text-zinc-400">Not configured</Badge>;
    if (limit.state === "unlimited") return <Badge>Unlimited</Badge>;
    if (limit.state === "disabled") return <Badge variant="destructive">Disabled</Badge>;
    // PLATFORM-P0-06.5 decision #2: the limit's own type rides alongside its numeric value
    // -- "Soft" makes clear this ceiling never actually blocks anything, distinct from an
    // ordinary (hard) numeric limit which reads unadorned, matching this table's own
    // pre-06.5 look exactly (no visual change for the still-default 'hard' case).
    return (
      <Badge variant="secondary" className="gap-1">
        {limit.limitValue}
        {limit.limitType === "soft" && <span className="text-zinc-400">(soft)</span>}
      </Badge>
    );
  }

  function RowControls({ limit }: { limit: PlanResourceLimit }) {
    const key = limit.resourceKey;
    const draft = drafts[key];
    const isPending = pendingKey === key;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          value={draft.state}
          onChange={(e) => updateDraft(key, { state: e.target.value as LimitState })}
          className={`${FIELD_CLASS} w-32`}
        >
          <option value="limited">Limited</option>
          <option value="unlimited">Unlimited</option>
          <option value="disabled">Disabled</option>
        </NativeSelect>
        {draft.state === "limited" ? (
          <>
            <Input
              type="number"
              min={0}
              step="1"
              value={draft.limitValue}
              onChange={(e) => updateDraft(key, { limitValue: e.target.value })}
              placeholder="e.g. 5"
              className={`${FIELD_CLASS} w-24`}
            />
            <NativeSelect
              value={draft.limitType}
              onChange={(e) => updateDraft(key, { limitType: e.target.value as LimitType })}
              className={`${FIELD_CLASS} w-28`}
              title="Hard limits deny the action once reached. Soft limits never block -- they only flag that usage is over the plan's guideline."
            >
              <option value="hard">Hard</option>
              <option value="soft">Soft</option>
            </NativeSelect>
          </>
        ) : null}
        <Button size="sm" disabled={isPending} onClick={() => save(key)}>
          Save
        </Button>
        {limit.configured ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50"
            onClick={() => clear(key)}
          >
            Clear
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-800">
      <div className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-100">Quantity limits</h2>
        <p className="text-xs text-zinc-500">
          Numeric ceilings this plan enforces per resource. Unlimited and Disabled are explicit states, never a stand-in number.
          A Limited resource is Hard (blocks once reached) or Soft (never blocks -- usage past it is only flagged, never denied).
        </p>
      </div>

      <ul className="divide-y divide-zinc-800 md:hidden">
        {rows.map((limit) => (
          <li key={limit.resourceKey} className="flex flex-col gap-2 p-3 text-sm text-zinc-100">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{RESOURCE_LABELS[limit.resourceKey]}</p>
              <StateBadge limit={limit} />
            </div>
            <RowControls limit={limit} />
          </li>
        ))}
      </ul>

      <Table className="hidden md:table">
        <TableHeader>
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className="text-zinc-400">Resource</TableHead>
            <TableHead className="text-zinc-400">Current</TableHead>
            <TableHead className="text-right text-zinc-400">Configure</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((limit) => (
            <TableRow key={limit.resourceKey} className="border-zinc-800 hover:bg-zinc-900/60">
              <TableCell className="text-zinc-100">{RESOURCE_LABELS[limit.resourceKey]}</TableCell>
              <TableCell>
                <StateBadge limit={limit} />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end">
                  <RowControls limit={limit} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
