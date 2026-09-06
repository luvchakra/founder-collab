"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@cofounderai/core/ui/button";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { ProspectWithPipeline } from "../../lib/prospects/queries";
import { NEXT_ACTION_ANCHOR, PROSPECT_STAGE_LABEL, PROSPECT_STAGES } from "../../lib/prospects/pipeline";

const COLUMN_COUNT = 8;

/**
 * Each row is a "stretched link" (a transparent, absolutely-positioned Link filling the
 * row via the `relative` `<tr>` it's a descendant of, Bootstrap's stretched-link pattern)
 * rather than a JS onClick+router.push -- a real anchor keeps the row keyboard-focusable
 * and works with screen readers for free. The checkbox cell sits at a higher z-index so
 * it keeps intercepting clicks over the link beneath it.
 *
 * Rows are grouped into one `<tbody>` per pipeline stage (in PROSPECT_STAGES order, empty
 * stages omitted), each headed by a spanning row naming the stage and its count, rather
 * than a flat list with a per-row stage badge -- grouping is what the founder actually
 * asked to see, and it stays correct under any of the sort dropdown's orderings since it
 * only partitions `prospects`, never reorders within a stage. "Select all" and the bulk
 * action bar still operate on the full flattened list across every group.
 */
export function ProspectsTable({
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
    <form action={bulkResearchAction} className="flex flex-col gap-3">
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <SubmitButton size="sm" variant="outline" pendingText="Researching...">
            Research selected
          </SubmitButton>
          <SubmitButton
            size="sm"
            variant="outline"
            pendingText="Scoring..."
            formAction={bulkScoreAction}
          >
            Score selected
          </SubmitButton>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
          >
            Clear selection
          </Button>
          <p className="text-xs text-muted-foreground">
            Only checked prospects already at the matching stage (new for research,
            researched for score) are affected -- the rest are skipped.
          </p>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-left text-muted-foreground">
              <th className="py-2 pr-2 pl-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all prospects"
                  className="size-4"
                />
              </th>
              <th className="py-2 pr-4 font-medium">Company</th>
              <th className="py-2 pr-4 font-medium">Industry</th>
              <th className="py-2 pr-4 font-medium">Size</th>
              <th className="py-2 pr-4 font-medium">Location</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Fit score</th>
              <th className="py-2 pr-4 font-medium">Next action</th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.stage}>
              <tr className="border-b bg-muted/50">
                <td
                  colSpan={COLUMN_COUNT}
                  className="py-1.5 pr-4 pl-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  {PROSPECT_STAGE_LABEL[group.stage]} ({group.prospects.length})
                </td>
              </tr>
              {group.prospects.map((p) => (
                <tr key={p.id} className="relative border-b last:border-0 hover:bg-accent/60">
                  <td className="relative z-10 py-2 pr-2 pl-3">
                    <input
                      type="checkbox"
                      name="ids"
                      value={p.id}
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      aria-label={`Select ${p.company_name}`}
                      className="size-4"
                    />
                  </td>
                  <td className="py-2 pr-4 font-medium">
                    <Link
                      href={`${basePath}/${p.id}`}
                      className="absolute inset-0 z-0"
                      aria-label={p.company_name}
                    />
                    {p.company_name}
                    {p.isStuck ? (
                      <span
                        title={`No activity since ${new Date(p.lastActivityAt).toLocaleDateString()}`}
                        className="ml-1.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
                      >
                        Needs next step
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{p.industry ?? "—"}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{p.company_size ?? "—"}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{p.location ?? "—"}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{p.status}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{p.fit_score ?? "—"}</td>
                  <td className="relative z-10 py-2 pr-4">
                    {p.nextAction ? (
                      <Link
                        href={`${basePath}/${p.id}#${NEXT_ACTION_ANCHOR[p.nextAction] ?? ""}`}
                        className="rounded-md border bg-background px-2 py-1 text-xs font-medium hover:bg-accent"
                      >
                        {p.nextAction}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </form>
  );
}
