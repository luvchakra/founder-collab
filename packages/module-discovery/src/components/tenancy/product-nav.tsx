"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@cofounderai/core/lib/utils";

type StageId = "overview" | "icp" | "prospects" | "conversions";

/**
 * Stage tabs, chevron-separated -- same visual language as this app's own breadcrumbs
 * (Dashboard > Business > Product). NOT co-founder-ai's interlocking clip-path chevron
 * tabs: that version clipped/overlapped adjacent tabs on the reporter's real phone on
 * two separate occasions, including after widening the clip-path clearance -- it
 * rendered correctly in every desktop and simulated-mobile check this session could run,
 * so the failure lives somewhere in mobile rendering this sandbox can't reproduce or
 * safely iterate against. Each tab here is a plain rectangle with normal padding --
 * clip-path never touches the text-bearing element, so tabs cannot overlap or clip
 * regardless of device, font metrics, or viewport width. This is the final design for
 * this component; do not reintroduce the clip-path/negative-margin version.
 */
export function ProductNav({
  basePath,
  completed,
}: {
  basePath: string;
  /** Real workflow progress (profile generated, ICP exists, prospects added) -- reached
   * stages get a tinted-primary fill instead of the neutral muted one, so progress reads
   * from color alone (muted -> tinted -> solid primary for the current stage) with no
   * separate checkmark icon. Conversions has no completion concept, so it's omitted here
   * and stays neutral unless it's the current tab. Usage lives next to the product name
   * (see the product layout), not as a tab here -- as a fifth tab it stretched this strip
   * too wide. */
  completed?: Partial<Record<StageId, boolean>>;
}) {
  const pathname = usePathname();
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

  return (
    <nav aria-label="Product sections" className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
      {tabs.map((tab, i) => {
        const isActive = i === activeIndex;
        const isCompleted = !isActive && Boolean(completed?.[tab.id]);
        return (
          <div key={tab.href} className="flex shrink-0 items-center gap-1">
            {i > 0 ? (
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : null}
            <Link
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex h-8 w-max shrink-0 items-center justify-center rounded-md px-3.5 font-medium whitespace-nowrap transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : isCompleted
                    ? "bg-primary/20 text-primary hover:bg-primary/30"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
