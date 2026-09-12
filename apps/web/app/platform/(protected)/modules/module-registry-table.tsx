"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Switch } from "@cofounderai/core/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import type { ModuleRegistryEntry, ModuleStatus } from "@cofounderai/core/admin/platform-modules";
import { setModuleMetaAction, setModuleVisibleAction } from "./actions";
import { KillSwitchDialog } from "./kill-switch-dialog";

const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";

const STATUS_LABELS: Record<ModuleStatus, string> = {
  available: "Available",
  read_only: "Read-only",
  maintenance: "Maintenance",
  disabled: "Disabled",
};

type MetaDraft = { status: ModuleStatus; version: string };

/**
 * PLATFORM-P0-07.1 ("Module Registry", §11) -- one row per licensable module.
 *
 * `enabled` (PLATFORM-P0-07.2's own "Platform-Wide Module Kill Switch") is never a plain
 * instant-flip switch -- clicking its badge opens `KillSwitchDialog`, which requires a
 * reason, shows the real live impact count, and requires an explicit acknowledgement
 * before the change is submitted (see that component's own docstring). `licensed` is
 * read-only (always "Yes" -- computed, see `platform-modules.ts`'s own docstring for why).
 * `minimumPlan` is read-only, derived display data (PLATFORM-P0-04.3's `plan_modules` is
 * the actual entitlement source).
 *
 * `visible` is a plain instant-flip switch (no confirmation needed -- it only affects a
 * not-yet-built marketing/module-picker surface, never access) mirroring
 * `module-entitlements-section.tsx`'s own "single boolean, no separate save step" shape.
 * `status`/`version` are edited together with one Save button, mirroring
 * `quantity-limits-section.tsx`'s own "two related fields, one Save" shape.
 */
export function ModuleRegistryTable({ modules }: { modules: ModuleRegistryEntry[] }) {
  const [rows, setRows] = useState(modules);
  const [drafts, setDrafts] = useState<Record<string, MetaDraft>>(() =>
    Object.fromEntries(modules.map((m) => [m.moduleKey, { status: m.status, version: m.version ?? "" }])),
  );
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function updateDraft(key: string, next: Partial<MetaDraft>) {
    setDrafts((d) => ({ ...d, [key]: { ...d[key], ...next } }));
  }

  function onKillSwitchChanged(moduleKey: string, nextEnabled: boolean) {
    setRows((r) => r.map((row) => (row.moduleKey === moduleKey ? { ...row, enabled: nextEnabled } : row)));
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

  function saveMeta(moduleKey: string) {
    const draft = drafts[moduleKey];
    setPendingKey(`${moduleKey}:meta`);
    startTransition(async () => {
      const result = await setModuleMetaAction({ moduleKey, status: draft.status, version: draft.version });
      setPendingKey(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRows((r) =>
        r.map((row) =>
          row.moduleKey === moduleKey
            ? { ...row, status: draft.status, version: draft.version === "" ? null : draft.version }
            : row,
        ),
      );
      toast.success(`${moduleKey} updated.`);
    });
  }

  function StatusBadge({ status }: { status: ModuleStatus }) {
    const variant = status === "available" ? "default" : status === "disabled" ? "destructive" : "secondary";
    return <Badge variant={variant}>{STATUS_LABELS[status]}</Badge>;
  }

  function MetaControls({ moduleKey }: { moduleKey: string }) {
    const draft = drafts[moduleKey];
    const isPending = pendingKey === `${moduleKey}:meta`;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          value={draft.status}
          onChange={(e) => updateDraft(moduleKey, { status: e.target.value as ModuleStatus })}
          className={`${FIELD_CLASS} w-32`}
        >
          {(Object.keys(STATUS_LABELS) as ModuleStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
        <Input
          value={draft.version}
          onChange={(e) => updateDraft(moduleKey, { version: e.target.value })}
          placeholder="e.g. 1.2"
          className={`${FIELD_CLASS} w-24`}
        />
        <Button size="sm" disabled={isPending} onClick={() => saveMeta(moduleKey)}>
          Save
        </Button>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-800">
      <div className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-100">Module registry</h2>
        <p className="text-xs text-zinc-500">
          Every licensable module&apos;s platform-wide operational state. Click Enabled/Disabled to use the kill
          switch -- it requires a reason and confirmation. Maintenance-mode messaging is a separate, later flow.
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
              <StatusBadge status={m.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
              <KillSwitchDialog
                moduleKey={m.moduleKey}
                moduleName={m.moduleName}
                enabled={m.enabled}
                onChanged={(next) => onKillSwitchChanged(m.moduleKey, next)}
              />
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
            <MetaControls moduleKey={m.moduleKey} />
          </li>
        ))}
      </ul>

      <Table className="hidden md:table">
        <TableHeader>
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className="text-zinc-400">Module</TableHead>
            <TableHead className="text-zinc-400">Enabled</TableHead>
            <TableHead className="text-zinc-400">Visible</TableHead>
            <TableHead className="text-zinc-400">Licensed</TableHead>
            <TableHead className="text-zinc-400">Min. plan</TableHead>
            <TableHead className="text-zinc-400">Status / version</TableHead>
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
                <KillSwitchDialog
                  moduleKey={m.moduleKey}
                  moduleName={m.moduleName}
                  enabled={m.enabled}
                  onChanged={(next) => onKillSwitchChanged(m.moduleKey, next)}
                />
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
                <div className="flex flex-col gap-1">
                  <StatusBadge status={m.status} />
                  <MetaControls moduleKey={m.moduleKey} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
