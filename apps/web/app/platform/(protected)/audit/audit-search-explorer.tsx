"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { diffSnapshotFields } from "@cofounderai/core/admin/config-history-diff";
import {
  AUDIT_RESOURCE_TYPE_OPTIONS,
  type AuditLogEntry,
  type AuditLogFilters,
  type AuditResourceType,
  type AuditSeverity,
} from "@cofounderai/core/admin/platform-audit-log-types";
import { searchAuditLogAction } from "./actions";

const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";

/**
 * PLATFORM-P0-16.3 ("Audit Search", §20). Every filter change re-fetches from an explicit
 * `onChange` handler via a server action, never a bare `useEffect` -- same reasoning
 * `config-history-explorer.tsx`'s own docstring gives (the `react-hooks/set-state-in-
 * effect` lint rule).
 */
export function AuditSearchExplorer({
  actors,
  initialEntries,
}: {
  actors: { id: string; label: string }[];
  initialEntries: AuditLogEntry[];
}) {
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [entries, setEntries] = useState(initialEntries);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function updateFilter<K extends keyof AuditLogFilters>(key: K, value: AuditLogFilters[K]) {
    const next = { ...filters, [key]: value || undefined };
    setFilters(next);
    startTransition(async () => {
      setEntries(await searchAuditLogAction(next));
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="flex flex-col gap-1.5">
          <Label className="text-zinc-300">From</Label>
          <Input
            type="date"
            className={FIELD_CLASS}
            onChange={(e) => updateFilter("dateFrom", e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-zinc-300">To</Label>
          <Input
            type="date"
            className={FIELD_CLASS}
            onChange={(e) => updateFilter("dateTo", e.target.value ? `${e.target.value}T23:59:59.999Z` : undefined)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-zinc-300">Actor</Label>
          <NativeSelect className={FIELD_CLASS} onChange={(e) => updateFilter("actorId", e.target.value)}>
            <option value="">All actors</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-zinc-300">Resource</Label>
          <NativeSelect
            className={FIELD_CLASS}
            onChange={(e) => updateFilter("resourceType", (e.target.value || undefined) as AuditResourceType | undefined)}
          >
            <option value="">All resources</option>
            {AUDIT_RESOURCE_TYPE_OPTIONS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-zinc-300">Severity</Label>
          <NativeSelect
            className={FIELD_CLASS}
            onChange={(e) => updateFilter("severity", (e.target.value || undefined) as AuditSeverity | undefined)}
          >
            <option value="">All severities</option>
            <option value="high">High</option>
            <option value="normal">Normal</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-zinc-300">Action</Label>
          <NativeSelect className={FIELD_CLASS} onChange={(e) => updateFilter("action", e.target.value)}>
            <option value="">All actions</option>
            <option value="created">Created</option>
            <option value="updated">Updated</option>
            <option value="deleted">Deleted</option>
            <option value="status_changed">Status changed</option>
          </NativeSelect>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800">
        {pending ? (
          <p className="px-4 py-6 text-sm text-zinc-500">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">No audit events match these filters.</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {entries.map((entry) => (
              <AuditRow
                key={entry.id}
                entry={entry}
                expanded={expanded === entry.id}
                onToggle={() => setExpanded(expanded === entry.id ? null : entry.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AuditRow({ entry, expanded, onToggle }: { entry: AuditLogEntry; expanded: boolean; onToggle: () => void }) {
  const diffs = diffSnapshotFields(entry.before, entry.after);

  return (
    <li className="flex flex-col gap-2 p-3 text-sm text-zinc-100">
      <button type="button" onClick={onToggle} className="flex flex-wrap items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="size-4 text-zinc-500" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4 text-zinc-500" aria-hidden="true" />
          )}
          <SeverityBadge severity={entry.severity} />
          <span className="font-medium">{entry.resourceLabel}</span>
          <span className="text-xs text-zinc-500">{actionLabel(entry.action)}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
          <span>{entry.performedByLabel}</span>
          <span>{new Date(entry.performedAt).toLocaleString()}</span>
        </span>
      </button>
      {entry.reason ? <p className="pl-6 text-xs text-zinc-400">{entry.reason}</p> : null}
      {entry.resourceId ? <p className="pl-6 font-mono text-xs text-zinc-500">{entry.resourceId}</p> : null}
      {expanded ? (
        diffs.length === 0 ? (
          <p className="pl-6 text-xs text-zinc-500">No field-level changes recorded for this event.</p>
        ) : (
          <ul className="ml-6 flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2 text-xs">
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

function SeverityBadge({ severity }: { severity: AuditSeverity }) {
  return <Badge variant={severity === "high" ? "destructive" : "secondary"}>{severity === "high" ? "High" : "Normal"}</Badge>;
}

function actionLabel(action: string): string {
  return { created: "Created", updated: "Updated", deleted: "Deleted", status_changed: "Status changed" }[action] ?? action;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
