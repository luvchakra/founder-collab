"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@cofounderai/core/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import type { ComplianceCountry } from "@cofounderai/core/admin/platform-compliance";
import { CountryDialog } from "./country-dialog";
import { setComplianceCountryEnabledAction } from "./actions";

/**
 * PLATFORM-P0-13.1 ("Country Registry") -- the platform-wide list of countries a
 * superadmin has added, each with an instant-flip "offered platform-wide" switch (same
 * "single boolean, no separate save step" shape `module-entitlements-section.tsx`
 * established). Desktop table / mobile card split per CLAUDE.md development principle #12
 * and docs/design/claude-ui-design-rules.md rule 5, mirroring `plans/page.tsx`'s own split.
 */
export function CountryRegistryTable({ countries }: { countries: ComplianceCountry[] }) {
  const [rows, setRows] = useState(countries);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(countryCode: string, next: boolean) {
    const previous = rows;
    setRows((r) => r.map((row) => (row.countryCode === countryCode ? { ...row, enabled: next } : row)));
    setPendingCode(countryCode);
    startTransition(async () => {
      const result = await setComplianceCountryEnabledAction(countryCode, next);
      setPendingCode(null);
      if (!result.ok) {
        setRows(previous);
        toast.error(result.error);
        return;
      }
      toast.success(next ? "Country offered platform-wide." : "Country no longer offered platform-wide.");
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-800">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Country registry</h2>
          <p className="text-xs text-zinc-500">Which countries WonderArc administratively offers, platform-wide.</p>
        </div>
        <CountryDialog />
      </div>

      <ul className="divide-y divide-zinc-800 md:hidden">
        {rows.map((c) => (
          <li key={c.countryCode} className="flex flex-col gap-2 p-3 text-sm text-zinc-100">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-zinc-500">{c.countryCode}</p>
              </div>
              <Switch
                checked={c.enabled}
                disabled={pendingCode === c.countryCode}
                onCheckedChange={(next) => toggle(c.countryCode, next)}
                aria-label={`Toggle ${c.name} availability`}
              />
            </div>
            {c.notes ? <p className="text-xs text-zinc-500">{c.notes}</p> : null}
            <CountryDialog country={c} />
          </li>
        ))}
      </ul>

      <Table className="hidden md:table">
        <TableHeader>
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead className="text-zinc-400">Country</TableHead>
            <TableHead className="text-zinc-400">Notes</TableHead>
            <TableHead className="text-zinc-400">Offered</TableHead>
            <TableHead className="text-right text-zinc-400">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.countryCode} className="border-zinc-800 hover:bg-zinc-900/60">
              <TableCell className="text-zinc-100">
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-zinc-500">{c.countryCode}</p>
              </TableCell>
              <TableCell className="max-w-xs text-zinc-400">{c.notes ?? "—"}</TableCell>
              <TableCell>
                <Switch
                  checked={c.enabled}
                  disabled={pendingCode === c.countryCode}
                  onCheckedChange={(next) => toggle(c.countryCode, next)}
                  aria-label={`Toggle ${c.name} availability`}
                />
              </TableCell>
              <TableCell className="text-right">
                <CountryDialog country={c} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
