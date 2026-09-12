"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Switch } from "@cofounderai/core/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import type { ModuleRegistryEntry, ModuleStatus } from "@cofounderai/core/admin/platform-modules";
import { setModuleVersionAction, setModuleVisibleAction } from "./actions";
import { ModuleStatusDialog } from "./module-status-dialog";

const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";

/**
 * PLATFORM-P0-07.1 ("Module Registry", §11) -- one row per licensable module.
 *
 * PLATFORM-P0-07.3's own reconciliation replaced the separate "Enabled" column (a plain
 * badge opening the old kill-switch-only dialog) and the separate status/version
 * NativeSelect+Save controls with ONE "Status" control: clicking the status badge opens
 * `ModuleStatusDialog`, which covers all four statuses (including the old kill switch's
 * plain on/off, now `available`/`disabled`) and requires a reason for every change, plus
 * a live impact count and an explicit acknowledgement whenever the change enters or
 * leaves a fully-blocked status (`maintenance`/`disabled`) -- see that dialog's own
 * docstring. `enabled` is shown only as a small derived read-only label next to the
 * status badge (never its own control) -- the database itself derives it from `status`
 * (PLATFORM-P0-07.3's reconciliation migration), so a second, independent UI control for
 * it would reintroduce exactly the duplicated-state problem that reconciliation removed.
 * `licensed` is read-only (always "Yes" -- computed, see `platform-modules.ts`'s own
 * docstring for why). `minimumPlan` is read-only, derived display data (PLATFORM-P0-04.3's
 * `plan_modules` is the actual entitlement source).
 *
 * `visible` is a plain instant-flip switch (no confirmation needed -- it only affects a
 * not-yet-built marketing/module-picker surface, never access) mirroring
 * `module-entitlements-section.tsx`'s own "single boolean, no separate save step" shape.
 * `version` is its own plain, unaudited text field with its own Save button -- split out
 * from `status` because a version label has no access effect on any business (see
 * `setModuleVersion()`'s own docstring).
 */
export function ModuleRegistryTable({ modules }: { modules: ModuleRegistryEntry[] }) {
  const [rows, setRows] = useState(modules);
  const [versionDrafts, setVersionDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(modules.map((m) => [m.moduleKey, m.version ?? ""])),
  );
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function onStatusChanged(moduleKey: string, status: ModuleStatus, message: string | null) {
    setRows((r) =>
      r.map((row) =>
        row.moduleKey === moduleKey
          ? { ...row, status, customerFacingMessage: message, enabled: status === "available" || status === "read_only" }
          : row,
      ),
    );
  }

  function toggleVisible(moduleKey: string, next: boolean) {
    const previous = rows;
    setRows((r) => r.map((row) => (row.moduleKey === moduleKey ? { ...row, visible: next } : row)));
    setPendingKey(`${moduleKey}:visible`);
    startTransition(async () => {
      const result = await setModuleVisibleAction(moduleKey, next);
      setPendingKey(null);
      if (!result.ok) {
        setRows(previous);
        toast.error(result.error);
        return;
      }
      toast.success(`${moduleKey} ${next ? "shown" : "hidden"}.`);
    });
  }

  function saveVersion(moduleKey: string) {
    const version = versionDrafts[moduleKey];
    setPendingKey(`${moduleKey}:version`);
    startTransition(async () => {
      const result = await setModuleVersionAction({ moduleKey, version });
      setPendingKey(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRows((r) =>
        r.map((row) => (row.moduleKey === moduleKey ? { ...row, version: version === "" ? null : version } : row)),
      );
      toast.success(`${moduleKey} version updated.`);
    });
  }

  function VersionControl({ moduleKey }: { moduleKey: string }) {
    const isPending = pendingKey === `${moduleKey}:version`;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={versionDrafts[moduleKey]}
          onChange={(e) => setVersionDrafts((d) => ({ ...d, [moduleKey]: e.target.value }))}
          placeholder="e.g. 1.2"
          className={`${FIELD_CLASS} w-24`}
        />
        <Button size="sm" disabled={isPending} onClick={() => saveVersion(moduleKey)}>
          Save
        </Button>
      </div>
    );
  }

  function StatusCell({ m }: { m: ModuleRegistryEntry }) {
    return (
      <div className="flex flex-col items-start gap-1">
        <ModuleStatusDialog
          moduleKey={m.moduleKey}
          moduleName={m.moduleName}
          status={m.status}
          message={m.customerFacingMessage}
          onChanged={(status, message) => onStatusChanged(m.moduleKey, status, message)}
        />
        <span className="text-xs text-zinc-500">{m.enabled ? "Reachable" : "Blocked platform-wide"}</span>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-800">
      <div className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-100">Module registry</h2>
        <p className="text-xs text-zinc-500">
          Every licensable module&apos;s platform-wide operational state. Click a module&apos;s status to change it
          -- Maintenance and Disabled require a reason and confirmation, since both fully block every business.
        </p>
      </div>

      <ul className="divide-y divide-zinc-800 md:hidden">
        {rows.map((m) => (
          <li key={m.moduleKey} className="flex flex-col gap-2 p-3 text-sm text-zinc-100">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{m.moduleName}</p>
                <p className="text-xs text-zinc-500">{m.moduleKey}</p>
              </div>
              <StatusCell m={m} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
              <span>Licensed</span>
              <span>Min. plan: {m.minimumPlan ? m.minimumPlan.name : "None"}</span>
              {m.version ? <span>v{m.version}</span> : null}
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <Switch
                  checked={m.visible}
                  disabled={pendingKey === `${m.moduleKey}:visible`}
                  onCheckedChange={(next) => toggleVisible(m.moduleKey, next)}
                  aria-label={`Toggle ${m.moduleName} visibility`}
                />
                Visible
              </label>
            </div>
            <VersionControl moduleKey={m.moduleKey} />
          </li>
        ))}
      </ul>

      <Table className="hidden md:table">
        <TableHeader>
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className="text-zinc-400">Module</TableHead>
            <TableHead className="text-zinc-400">Status</TableHead>
            <TableHead className="text-zinc-400">Visible</TableHead>
            <TableHead className="text-zinc-400">Licensed</TableHead>
            <TableHead className="text-zinc-400">Min. plan</TableHead>
            <TableHead className="text-zinc-400">Version</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => (
            <TableRow key={m.moduleKey} className="border-zinc-800 hover:bg-zinc-900/60">
              <TableCell className="text-zinc-100">
                <p className="font-medium">{m.moduleName}</p>
                <p className="text-xs text-zinc-500">{m.moduleKey}</p>
              </TableCell>
              <TableCell>
                <StatusCell m={m} />
              </TableCell>
              <TableCell>
                <Switch
                  checked={m.visible}
                  disabled={pendingKey === `${m.moduleKey}:visible`}
                  onCheckedChange={(next) => toggleVisible(m.moduleKey, next)}
                  aria-label={`Toggle ${m.moduleName} visibility`}
                />
              </TableCell>
              <TableCell className="text-zinc-300">{m.licensed ? "Yes" : "No"}</TableCell>
              <TableCell className="text-zinc-300">{m.minimumPlan ? m.minimumPlan.name : "None"}</TableCell>
              <TableCell>
                <VersionControl moduleKey={m.moduleKey} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
