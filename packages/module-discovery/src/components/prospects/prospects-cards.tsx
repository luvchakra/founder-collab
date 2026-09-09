"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@cofounderai/core/ui/button";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { cn } from "@cofounderai/core/lib/utils";
import type { ProspectWithPipeline } from "../../lib/prospects/queries";
import { NEXT_ACTION_ANCHOR, PROSPECT_STAGE_LABEL, PROSPECT_STAGES } from "../../lib/prospects/pipeline";

/**
 * Each card is a "stretched link" (a transparent, absolutely-positioned Link filling
 * the card via the `relative` wrapper it's a descendant of, Bootstrap's
 * stretched-link pattern) rather than a JS onClick+router.push -- a real anchor keeps
 * the card keyboard-focusable and works with screen readers for free. The checkbox and
 * the "next action" link both sit at a higher z-index so they keep intercepting clicks
 * over the card-wide link beneath them.
 *
 * Cards are grouped into one heading per pipeline stage (in PROSPECT_STAGES order,
 * empty stages omitted) rather than a flat grid with a per-card stage badge -- grouping
 * is what the founder actually asked to see, and it stays correct under any of the sort
 * dropdown's orderings since it only partitions `prospects`, never reorders within a
 * stage. "Select all" and the bulk action bar still operate on the full flattened list
 * across every group. Replaced the previous row-table layout with this compact-card
 * grid per explicit request -- same data and actions, no `<table>`.
 */
export function ProspectsCards({
  prospects,
  basePath,
  bulkResearchAction,
  bulkScoreAction,
}: {
  prospects: ProspectWithPipeline[];
  basePath: string;
  bulkResearchAction: (formData: FormData) => void | Promise<void>;
  bulkScoreAction: (formData: FormData) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === prospects.length ? new Set() : new Set(prospects.map((p) => p.id)),
    );
  }

  const allSelected = prospects.length > 0 && selected.size === prospects.length;

  const groups = PROSPECT_STAGES.map((stage) => ({
    stage,
    prospects: prospects.filter((p) => p.stage === stage),
  })).filter((g) => g.prospects.length > 0);

  return (
    <form action={bulkResearchAction} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            aria-label="Select all prospects"
            className="size-4"
          />
          Select all
        </label>
        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
            <span className="text-sm font-medium">{selected.size} selected</span>
            <SubmitButton size="sm" variant="outline" pendingText="Researching...">
              Research selected
            </SubmitButton>
            <SubmitButton size="sm" variant="outline" pendingText="Scoring..." formAction={bulkScoreAction}>
              Score selected
            </SubmitButton>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
          </div>
        ) : null}
      </div>

      {groups.map((group) => (
        <div key={group.stage} className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {PROSPECT_STAGE_LABEL[group.stage]} ({group.prospects.length})
          </p>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.prospects.map((p) => (
              <li
                key={p.id}
                className="relative flex flex-col gap-2 rounded-lg border p-3 text-sm transition-colors hover:border-primary hover:bg-accent/40"
              >
                <Link href={`${basePath}/${p.id}`} className="absolute inset-0 z-0" aria-label={p.company_name} />

                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    <input
                      type="checkbox"
                      name="ids"
                      value={p.id}
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      aria-label={`Select ${p.company_name}`}
                      className="relative z-10 mt-0.5 size-4 shrink-0"
                    />
                    <span className="truncate font-medium">{p.company_name}</span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">Fit {p.fit_score ?? "—"}</span>
                </div>

                <p className="truncate pl-6 text-xs text-muted-foreground">
                  {[p.industry, p.company_size, p.location].filter(Boolean).join(" · ") || "—"}
                </p>

                <div className="flex items-center justify-between gap-2 pl-6">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      p.status === "qualified"
                        ? "bg-primary/10 text-primary"
                        : p.status === "disqualified"
                          ? "bg-muted text-muted-foreground"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {p.status}
                  </span>
                  {p.isStuck ? (
                    <span
                      title={`No activity since ${new Date(p.lastActivityAt).toLocaleDateString()}`}
                      className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
                    >
                      Needs next step
                    </span>
                  ) : null}
                </div>

                {p.nextAction ? (
                  <Link
                    href={`${basePath}/${p.id}#${NEXT_ACTION_ANCHOR[p.nextAction] ?? ""}`}
                    className="relative z-10 mt-1 self-start rounded-md border bg-background px-2 py-1 pl-6 text-xs font-medium hover:bg-accent"
                  >
                    {p.nextAction}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </form>
  );
}
