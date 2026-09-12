"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@cofounderai/core/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import type { PlanModuleEntitlement } from "@cofounderai/core/admin/platform-plan-modules";
import { setModuleEnabledAction } from "./actions";

/**
 * PLATFORM-P0-04.3 ("Module Entitlements") -- one switch per module, toggled directly
 * (no separate save step: this is a single boolean flip per row, the same "no form to
 * submit" affordance a settings toggle anywhere else in this codebase already uses, not a
 * multi-field form that needs a save button). Desktop table / mobile card split per
 * CLAUDE.md development principle #12 and docs/design/claude-ui-design-rules.md rule 5,
 * mirroring `plans/page.tsx`'s own established split.
 */
export function ModuleEntitlementsSection({
  planId,
  entitlements,
}: {
  planId: string;
  entitlements: PlanModuleEntitlement[];
}) {
  const [rows, setRows] = useState(entitlements);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(moduleKey: string, next: boolean) {
    const previous = rows;
    setRows((r) => r.map((row) => (row.moduleKey === moduleKey ? { ...row, enabled: next } : row)));
    setPendingKey(moduleKey);
    startTransition(async () => {
      const result = await setModuleEnabledAction(planId, moduleKey, next);
      setPendingKey(null);
      if (!result.ok) {
        setRows(previous);
        toast.error(result.error);
        return;
      }
      toast.success(`${moduleKey} ${next ? "enabled" : "disabled"} for this plan.`);
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-800">
      <div className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-100">Module entitlements</h2>
        <p className="text-xs text-zinc-500">Which of the platform&apos;s modules this plan includes.</p>
      </div>

      <ul className="divide-y divide-zinc-800 md:hidden">
        {rows.map((row) => (
          <li key={row.moduleKey} className="flex items-center justify-between gap-3 p-3 text-sm text-zinc-100">
            <div>
              <p className="font-medium">{row.moduleName}</p>
              <p className="text-xs text-zinc-500">{row.moduleKey}</p>
            </div>
            <Switch
              checked={row.enabled}
              disabled={pendingKey === row.moduleKey}
              onCheckedChange={(next) => toggle(row.moduleKey, next)}
              aria-label={`Toggle ${row.moduleName} for this plan`}
            />
          </li>
        ))}
      </ul>

      <Table className="hidden md:table">
        <TableHeader>
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className="text-zinc-400">Module</TableHead>
            <TableHead className="text-zinc-400">Description</TableHead>
            <TableHead className="text-right text-zinc-400">Enabled</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.moduleKey} className="border-zinc-800 hover:bg-zinc-900/60">
              <TableCell className="text-zinc-100">
                <p className="font-medium">{row.moduleName}</p>
                <p className="text-xs text-zinc-500">{row.moduleKey}</p>
              </TableCell>
              <TableCell className="text-zinc-400">{row.moduleDescription ?? "—"}</TableCell>
              <TableCell className="text-right">
                <Switch
                  checked={row.enabled}
                  disabled={pendingKey === row.moduleKey}
                  onCheckedChange={(next) => toggle(row.moduleKey, next)}
                  aria-label={`Toggle ${row.moduleName} for this plan`}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
