"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import type { IntegrationCredentialOwnership, IntegrationRegistryEntry, IntegrationStatus } from "@cofounderai/core/admin/platform-integrations";
import { IntegrationStatusDialog } from "./integration-status-dialog";

const OWNERSHIP_LABELS: Record<IntegrationCredentialOwnership, string> = {
  platform_owned: "WonderArc-owned",
  customer_owned: "Customer-owned",
  both: "Both (platform + customer)",
};

/**
 * PLATFORM-P0-12.1 ("Integration Registry", §16) -- one row per integration category. See
 * `platform-integrations.ts`/its migration for what this table is and, per 12.4, why the
 * "Credentials" column below is display-only metadata (this table stores no credential of
 * any kind itself).
 *
 * Desktop table / mobile card split per CLAUDE.md development principle #12 and
 * docs/design/claude-ui-design-rules.md rule 5, mirroring `module-registry-table.tsx`'s
 * own established split.
 */
export function IntegrationRegistryTable({ integrations }: { integrations: IntegrationRegistryEntry[] }) {
  const [rows, setRows] = useState(integrations);

  function onStatusChanged(integrationKey: string, status: IntegrationStatus, notes: string | null) {
    setRows((r) =>
      r.map((row) => (row.integrationKey === integrationKey ? { ...row, status, notes, enabled: status !== "disabled" } : row)),
    );
  }

  function StatusCell({ entry }: { entry: IntegrationRegistryEntry }) {
    return (
      <div className="flex flex-col items-start gap-1">
        <IntegrationStatusDialog
          integrationKey={entry.integrationKey}
          displayName={entry.displayName}
          status={entry.status}
          notes={entry.notes}
          onChanged={(status, notes) => onStatusChanged(entry.integrationKey, status, notes)}
        />
        <span className="text-xs text-zinc-500">{entry.enabled ? "Reachable" : "Blocked platform-wide"}</span>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-800">
      <div className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-100">Integration registry</h2>
        <p className="text-xs text-zinc-500">
          Every external integration category WonderArc offers, its credential ownership model, and its
          platform-wide operational status. Click a category&apos;s status to change it -- Disabled is the
          emergency kill switch and requires a reason and confirmation.
        </p>
      </div>

      <ul className="divide-y divide-zinc-800 md:hidden">
        {rows.map((entry) => (
          <li key={entry.integrationKey} className="flex flex-col gap-2 p-3 text-sm text-zinc-100">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{entry.displayName}</p>
                <p className="text-xs text-zinc-500">{entry.integrationKey}</p>
              </div>
              <StatusCell entry={entry} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
              <span>Credentials: {OWNERSHIP_LABELS[entry.credentialOwnership]}</span>
            </div>
            {entry.notes ? <p className="text-xs text-zinc-500">{entry.notes}</p> : null}
          </li>
        ))}
      </ul>

      <Table className="hidden md:table">
        <TableHeader>
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className="text-zinc-400">Integration</TableHead>
            <TableHead className="text-zinc-400">Status</TableHead>
            <TableHead className="text-zinc-400">Credentials</TableHead>
            <TableHead className="text-zinc-400">Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((entry) => (
            <TableRow key={entry.integrationKey} className="border-zinc-800 hover:bg-zinc-900/60">
              <TableCell className="text-zinc-100">
                <p className="font-medium">{entry.displayName}</p>
                <p className="text-xs text-zinc-500">{entry.integrationKey}</p>
              </TableCell>
              <TableCell>
                <StatusCell entry={entry} />
              </TableCell>
              <TableCell className="text-zinc-300">{OWNERSHIP_LABELS[entry.credentialOwnership]}</TableCell>
              <TableCell className="max-w-xs text-zinc-400">{entry.notes ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
