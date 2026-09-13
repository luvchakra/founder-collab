"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@cofounderai/core/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import type { ComplianceCountry, CompliancePack } from "@cofounderai/core/admin/platform-compliance";
import { PackDialog } from "./pack-dialog";
import { updateCompliancePackAction } from "./actions";

/**
 * PLATFORM-P0-13.2 ("Compliance Pack Availability") -- one row per country+regime pack,
 * each with an instant-flip "offered platform-wide" switch and a link through to its own
 * PLATFORM-P0-13.4 feature-flag list. Desktop table / mobile card split per CLAUDE.md
 * development principle #12 and docs/design/claude-ui-design-rules.md rule 5.
 */
export function CompliancePackTable({ packs, countries }: { packs: CompliancePack[]; countries: ComplianceCountry[] }) {
  const [rows, setRows] = useState(packs);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function countryName(code: string) {
    return countries.find((c) => c.countryCode === code)?.name ?? code;
  }

  function toggle(pack: CompliancePack, next: boolean) {
    const previous = rows;
    setRows((r) => r.map((row) => (row.id === pack.id ? { ...row, enabled: next } : row)));
    setPendingId(pack.id);
    startTransition(async () => {
      const result = await updateCompliancePackAction(pack.id, {
        displayName: pack.displayName,
        enabled: next,
        version: pack.version ?? "",
        notes: pack.notes ?? "",
      });
      setPendingId(null);
      if (!result.ok) {
        setRows(previous);
        toast.error("error" in result ? result.error : "Could not update this pack.");
        return;
      }
      toast.success(next ? "Pack offered platform-wide." : "Pack no longer offered platform-wide.");
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-800">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Compliance packs</h2>
          <p className="text-xs text-zinc-500">Country/regime combinations, their version label, and feature flags.</p>
        </div>
        <PackDialog countries={countries} />
      </div>

      <ul className="divide-y divide-zinc-800 md:hidden">
        {rows.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 p-3 text-sm text-zinc-100">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{p.displayName}</p>
                <p className="text-xs text-zinc-500">
                  {countryName(p.countryCode)} · {p.regime}
                </p>
              </div>
              <Switch
                checked={p.enabled}
                disabled={pendingId === p.id}
                onCheckedChange={(next) => toggle(p, next)}
                aria-label={`Toggle ${p.displayName} availability`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
              <span>Version: {p.version ?? "—"}</span>
            </div>
            <div className="flex items-center gap-3">
              <PackDialog pack={p} countries={countries} />
              <Link href={`/platform/compliance/packs/${p.id}`} className="text-xs text-zinc-400 hover:text-zinc-100">
                Feature flags
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <Table className="hidden md:table">
        <TableHeader>
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className="text-zinc-400">Pack</TableHead>
            <TableHead className="text-zinc-400">Version</TableHead>
            <TableHead className="text-zinc-400">Offered</TableHead>
            <TableHead className="text-right text-zinc-400">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => (
            <TableRow key={p.id} className="border-zinc-800 hover:bg-zinc-900/60">
              <TableCell className="text-zinc-100">
                <p className="font-medium">{p.displayName}</p>
                <p className="text-xs text-zinc-500">
                  {countryName(p.countryCode)} · {p.regime}
                </p>
              </TableCell>
              <TableCell className="text-zinc-300">{p.version ?? "—"}</TableCell>
              <TableCell>
                <Switch
                  checked={p.enabled}
                  disabled={pendingId === p.id}
                  onCheckedChange={(next) => toggle(p, next)}
                  aria-label={`Toggle ${p.displayName} availability`}
                />
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-3">
                  <Link href={`/platform/compliance/packs/${p.id}`} className="text-xs text-zinc-400 hover:text-zinc-100">
                    Feature flags
                  </Link>
                  <PackDialog pack={p} countries={countries} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
