"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { PlatformPlan } from "@cofounderai/core/admin/platform-plans";
import { Switch } from "@cofounderai/core/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { PlanDialog } from "../plan-dialog";
import { setModuleEnabledAction } from "../[id]/entitlements/actions";

export type MatrixPlan = {
  plan: PlatformPlan;
  priceLabel: string;
  enabledModules: string[];
  /** Active provider prices, pre-formatted on the server ("Razorpay test · ₹2,999 / month"). */
  checkoutPrices: string[];
};

type ModuleColumn = { key: string; name: string };

/**
 * Plans x modules, one switch per cell, saved the moment it flips (the same no-save-button
 * affordance PLATFORM-P0-04.3's per-plan module section uses). Desktop: plans as columns so
 * the packaging reads across; below `md`: one card per plan (CLAUDE.md principle 12).
 */
export function PlanMatrix({ plans, modules }: { plans: MatrixPlan[]; modules: ModuleColumn[] }) {
  const [enabled, setEnabled] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(plans.map((p) => [p.plan.id, p.enabledModules])),
  );
  const [pending, setPending] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(plan: PlatformPlan, mod: ModuleColumn, next: boolean) {
    const moduleKey = mod.key;
    const previous = enabled;
    setEnabled((current) => ({
      ...current,
      [plan.id]: next ? [...current[plan.id], moduleKey] : current[plan.id].filter((k) => k !== moduleKey),
    }));
    setPending(`${plan.id}:${moduleKey}`);
    startTransition(async () => {
      const result = await setModuleEnabledAction(plan.id, moduleKey, next);
      setPending(null);
      if (!result.ok) {
        setEnabled(previous);
        toast.error(result.error);
        return;
      }
      toast.success(`${plan.name} ${next ? "now includes" : "no longer includes"} ${mod.name}.`);
    });
  }

  function cell(plan: PlatformPlan, mod: ModuleColumn) {
    return (
      <Switch
        checked={enabled[plan.id]?.includes(mod.key) ?? false}
        disabled={pending === `${plan.id}:${mod.key}`}
        onCheckedChange={(next) => toggle(plan, mod, next)}
        aria-label={`${mod.name} in ${plan.name}`}
      />
    );
  }

  function checkoutPrice(p: MatrixPlan) {
    return p.checkoutPrices.length > 0 ? (
      <ul className="flex flex-col gap-0.5">
        {p.checkoutPrices.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>
    ) : (
      <Link href={`/platform/plans/${p.plan.id}/entitlements`} className="text-amber-300 hover:text-amber-200">
        Not set
      </Link>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800">
      <ul className="divide-y divide-zinc-800 md:hidden">
        {plans.map((p) => (
          <li key={p.plan.id} className="flex flex-col gap-3 p-3 text-sm text-zinc-100">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{p.plan.name}</p>
                <p className="text-xs text-zinc-400">{p.priceLabel}</p>
              </div>
              <PlanDialog plan={p.plan} />
            </div>
            <ul className="flex flex-col gap-2">
              {modules.map((mod) => (
                <li key={mod.key} className="flex items-center justify-between gap-3">
                  <span className="text-zinc-300">{mod.name}</span>
                  {cell(p.plan, mod)}
                </li>
              ))}
            </ul>
            <div className="flex items-start justify-between gap-3 text-xs">
              <span className="text-zinc-500">Checkout price</span>
              <div className="text-right text-zinc-300">{checkoutPrice(p)}</div>
            </div>
          </li>
        ))}
      </ul>

      <Table className="hidden md:table">
        <TableHeader>
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className="text-zinc-400">Module</TableHead>
            {plans.map((p) => (
              <TableHead key={p.plan.id} className="text-center text-zinc-400">
                <div className="flex items-center justify-center gap-1 py-1">
                  <div>
                    <p className="font-medium text-zinc-100">{p.plan.name}</p>
                    <p className="text-xs font-normal text-zinc-400">{p.priceLabel}</p>
                  </div>
                  <PlanDialog plan={p.plan} />
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {modules.map((mod) => (
            <TableRow key={mod.key} className="border-zinc-800 hover:bg-zinc-900/60">
              <TableCell className="font-medium text-zinc-100">{mod.name}</TableCell>
              {plans.map((p) => (
                <TableCell key={p.plan.id} className="text-center">
                  {cell(p.plan, mod)}
                </TableCell>
              ))}
            </TableRow>
          ))}
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableCell className="text-zinc-400">Checkout price</TableCell>
            {plans.map((p) => (
              <TableCell key={p.plan.id} className="text-center text-xs text-zinc-300">
                {checkoutPrice(p)}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
