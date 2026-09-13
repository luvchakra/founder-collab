"use client";

import { useState, useTransition } from "react";
import { History, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Textarea } from "@cofounderai/core/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@cofounderai/core/ui/alert-dialog";
import type { ConfigResourceOption, ConfigResourceType, ConfigVersionEntry } from "@cofounderai/core/admin/config-history";
import { diffSnapshotFields } from "@cofounderai/core/admin/config-history-diff";
import { loadInstancesAction, loadVersionsAction, restoreVersionAction } from "./actions";

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";

type ResourceTypeOption = { key: ConfigResourceType; label: string; singleton: boolean; restorable: boolean };

/**
 * PLATFORM-P0-17.1/17.3. All data loading after the very first render happens inside an
 * explicit event handler (`onChange`, a button click), never a bare `useEffect` -- see
 * `page.tsx`'s own docstring for why.
 */
export function ConfigHistoryExplorer({
  resourceTypes,
  initialResourceType,
  initialInstances,
  initialInstanceId,
  initialVersions,
}: {
  resourceTypes: ResourceTypeOption[];
  initialResourceType: ConfigResourceType;
  initialInstances: ConfigResourceOption[];
  initialInstanceId: string | null;
  initialVersions: ConfigVersionEntry[];
}) {
  const [resourceType, setResourceType] = useState(initialResourceType);
  const [instances, setInstances] = useState(initialInstances);
  const [instanceId, setInstanceId] = useState(initialInstanceId);
  const [versions, setVersions] = useState(initialVersions);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const current = resourceTypes.find((t) => t.key === resourceType)!;

  function onResourceTypeChange(nextKey: ConfigResourceType) {
    const next = resourceTypes.find((t) => t.key === nextKey)!;
    setResourceType(nextKey);
    startTransition(async () => {
      const nextInstances = next.singleton ? [] : await loadInstancesAction(nextKey);
      const nextInstanceId = next.singleton ? null : (nextInstances[0]?.id ?? null);
      setInstances(nextInstances);
      setInstanceId(nextInstanceId);
      if (next.singleton || nextInstanceId) {
        setVersions(await loadVersionsAction(nextKey, nextInstanceId));
      } else {
        setVersions([]);
      }
    });
  }

  function onInstanceChange(nextId: string) {
    setInstanceId(nextId);
    startTransition(async () => {
      setVersions(await loadVersionsAction(resourceType, nextId));
    });
  }

  function refreshVersions() {
    startTransition(async () => {
      setVersions(await loadVersionsAction(resourceType, instanceId));
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-zinc-300">Configuration</Label>
          <NativeSelect
            value={resourceType}
            onChange={(e) => onResourceTypeChange(e.target.value as ConfigResourceType)}
            className={FIELD_CLASS}
          >
            {resourceTypes.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        {!current.singleton ? (
          <div className="flex flex-col gap-1.5">
            <Label className="text-zinc-300">Instance</Label>
            {instances.length === 0 ? (
              <p className="text-sm text-zinc-500">Nothing exists yet for this configuration.</p>
            ) : (
              <NativeSelect
                value={instanceId ?? ""}
                onChange={(e) => onInstanceChange(e.target.value)}
                className={FIELD_CLASS}
              >
                {instances.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-zinc-800">
        {pending ? (
          <p className="px-4 py-6 text-sm text-zinc-500">Loading…</p>
        ) : versions.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">No recorded changes yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {[...versions].reverse().map((v) => (
              <VersionRow
                key={v.eventId}
                version={v}
                resourceType={resourceType}
                resourceId={instanceId}
                restorable={current.restorable}
                expanded={expanded === v.eventId}
                onToggle={() => setExpanded(expanded === v.eventId ? null : v.eventId)}
                onRestored={refreshVersions}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function VersionRow({
  version,
  resourceType,
  resourceId,
  restorable,
  expanded,
  onToggle,
  onRestored,
}: {
  version: ConfigVersionEntry;
  resourceType: ConfigResourceType;
  resourceId: string | null;
  restorable: boolean;
  expanded: boolean;
  onToggle: () => void;
  onRestored: () => void;
}) {
  const diffs = diffSnapshotFields(version.before, version.after);

  return (
    <li className="flex flex-col gap-2 p-3 text-sm text-zinc-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onToggle} className="flex items-center gap-2 text-left hover:text-zinc-300">
          <History className="size-4 text-zinc-500" aria-hidden="true" />
          <span className="font-medium">v{version.version}</span>
          <span className="text-xs text-zinc-500">{actionLabel(version.action)}</span>
          {version.isCurrent ? <Badge variant="secondary">Current</Badge> : null}
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">{new Date(version.performedAt).toLocaleString()}</span>
          {restorable && !version.isCurrent && version.after ? (
            <RestoreVersionDialog
              resourceType={resourceType}
              resourceId={resourceId}
              version={version}
              onRestored={onRestored}
            />
          ) : null}
        </div>
      </div>
      <p className="text-xs text-zinc-400">{version.reason}</p>
      {expanded ? (
        diffs.length === 0 ? (
          <p className="text-xs text-zinc-500">No field-level changes recorded for this event.</p>
        ) : (
          <ul className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2 text-xs">
            {diffs.map((d) => (
              <li key={d.field} className="flex flex-wrap gap-1">
                <span className="font-mono text-zinc-400">{d.field}:</span>
                <span className="text-red-400 line-through">{formatValue(d.before)}</span>
                <span className="text-zinc-500">→</span>
                <span className="text-emerald-400">{formatValue(d.after)}</span>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </li>
  );
}

function RestoreVersionDialog({
  resourceType,
  resourceId,
  version,
  onRestored,
}: {
  resourceType: ConfigResourceType;
  resourceId: string | null;
  version: ConfigVersionEntry;
  onRestored: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await restoreVersionAction(resourceType, resourceId, version.eventId, reason);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Restored to v${version.version}.`);
      setOpen(false);
      setReason("");
      onRestored();
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setReason("");
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
          <RotateCcw className="size-4" aria-hidden="true" />
          Restore
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className={DIALOG_CLASS}>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore to v{version.version}?</AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            Applies v{version.version}&apos;s values as a new change. This itself becomes a new version -- nothing is
            deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="restore-reason" className="text-zinc-300">
            Reason (required)
          </Label>
          <Textarea
            id="restore-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. The v5 change caused unexpected behavior"
            className={FIELD_CLASS}
            rows={2}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
            disabled={pending || reason.trim().length === 0}
          >
            {pending ? "Restoring…" : "Restore"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function actionLabel(action: string): string {
  return { created: "Created", updated: "Updated", deleted: "Deleted", status_changed: "Status changed" }[action] ?? action;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
