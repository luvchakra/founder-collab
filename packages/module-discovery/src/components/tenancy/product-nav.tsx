"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@cofounderai/core/lib/utils";
import { useAutoPopulateProgress } from "./auto-populate-progress";

type StageId = "overview" | "icp" | "prospects" | "conversions";

/**
 * Progress-bar stepper, replacing the earlier single-row tab strips (co-founder-ai's
 * clip-path chevrons, then a flexbox tab strip with the label and a chevron side by
 * side). Both of those put a step's full label on one line next to its neighbors, so on
 * a narrow real phone -- where four labels plus padding genuinely don't fit one row --
 * the only options were clipping mid-word (ellipsis) or overlapping. Putting the label
 * *below* a small circular step indicator, instead of beside it, removes that ceiling
 * entirely: each step is its own flex:1 column, and a label that doesn't fit on one line
 * just wraps onto a second instead of losing letters -- the full word is always visible
 * regardless of viewport width.
 *
 * The connecting line between two steps is two plain (non-interactive, aria-hidden)
 * flex:1 divs on either side of the circle, filled solid once the step to their left has
 * been passed -- ordinary flex layout, no absolute positioning or negative margins, so
 * it can't reproduce the earlier overlap bugs either.
 */
export function ProductNav({
  basePath,
  completed,
}: {
  basePath: string;
  /** Real workflow progress (profile generated, ICP exists, prospects added) -- reached
   * stages get a checkmark and a tinted-primary circle instead of a numbered, neutral
   * one. Conversions has no completion concept, so it's omitted here and stays neutral
   * unless it's the current step. */
  completed?: Partial<Record<StageId, boolean>>;
}) {
  const pathname = usePathname();
  const { activeStage } = useAutoPopulateProgress();
  const tabs: { id: StageId; href: string; label: string }[] = [
    { id: "overview", href: basePath, label: "Overview" },
    { id: "icp", href: `${basePath}/icp`, label: "ICP" },
    { id: "prospects", href: `${basePath}/prospects`, label: "Prospects" },
    { id: "conversions", href: `${basePath}/conversions`, label: "Conversions" },
  ];

  const activeIndex = tabs.findIndex((tab) =>
    tab.href === basePath
      ? pathname === basePath
      : pathname === tab.href || pathname.startsWith(`${tab.href}/`),
  );

  /* DISC-OFFER-P0-03.3's "Offering Navigation" -- the numbered stepper below reads as
   * "do these once, in this order," which is right for a brand-new offering's initial
   * setup but wrong once it has a profile: from then on this is an ongoing workspace a
   * founder revisits constantly and out of order, not a checklist. Switching to a flat,
   * equal-weight tab bar once setup is complete matches how it's actually used, without
   * adding any destination that doesn't already exist -- the doc's own suggested
   * Discovery/Opportunities/Signals/Watchlist/Research entries have no page behind them
   * yet (04.2/05.x-07.x/P1/08.x), so they're left out rather than becoming dead links. */
  if (completed?.overview) {
    return (
      <nav aria-label="Offering sections" className="flex w-full flex-wrap gap-1 rounded-lg border border-border bg-muted p-1">
        {tabs.map((tab, i) => {
          const isActive = i === activeIndex;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Product sections"
      className="flex w-full items-start rounded-2xl border border-border bg-card px-4 py-5 sm:px-6"
    >
      {tabs.map((tab, i) => {
        const isActive = i === activeIndex;
        const isCompleted = !isActive && Boolean(completed?.[tab.id]);
        const isPast = i < activeIndex;
        const isProcessing = tab.id === activeStage;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className="flex min-w-0 flex-1 flex-col items-center gap-2 rounded-md py-1 transition-opacity hover:opacity-80"
          >
            <div className="flex w-full items-center" aria-hidden="true">
              <div
                className={cn(
                  "h-1 flex-1 rounded-full",
                  i === 0 ? "bg-transparent" : isPast || isCompleted ? "bg-primary" : "bg-muted",
                )}
              />
              <span
                className={cn(
                  "relative flex size-10 shrink-0 items-center justify-center rounded-full text-base font-semibold transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : isCompleted
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {isProcessing ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 animate-[spin_2.2s_linear_infinite] rounded-full border-2 border-transparent border-t-primary"
                  />
                ) : null}
                {i + 1}
                {isCompleted ? (
                  <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
                    <Check className="size-2.5" />
                  </span>
                ) : null}
              </span>
              <div
                className={cn(
                  "h-1 flex-1 rounded-full",
                  i === tabs.length - 1 ? "bg-transparent" : isPast ? "bg-primary" : "bg-muted",
                )}
              />
            </div>
            <span
              className={cn(
                // `text-xs` (not `text-sm`) below `sm`: at the default size "Conversions"
                // -- the longest label, and a single word with no space to wrap at --
                // didn't fit this column's width on a phone, so `break-words` split it
                // mid-word into "Conversion"/"s" on two lines instead of wrapping cleanly.
                // The smaller size fits the whole word on one line at every width that
                // matters; `break-words` stays on as a safety net for anything narrower.
                "max-w-full text-center text-xs leading-tight font-medium break-words sm:text-sm",
                isActive ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
