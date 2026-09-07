"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@cofounderai/core/lib/utils";

type StageId = "overview" | "icp" | "prospects" | "conversions";

/**
 * Stage tabs, built with flexbox rather than the clip-path/negative-margin interlocking
 * chevrons this repo tried three times before (co-founder-ai's own component) -- that
 * version repeatedly clipped/overlapped adjacent tabs on the reporter's real phone,
 * confirmed by screenshot each time, despite this session being unable to reproduce it in
 * any sandboxed check and finding no global CSS override responsible (audited
 * ui-theme.css/globals.css: the only `position: absolute` in the whole theme is scoped to
 * `.print-area`, unrelated). Root cause: two adjacent tabs' clip-path shapes are only
 * text-safe if their painted regions line up exactly with each other and with the
 * negative margin pulling them together -- any mismatch (font metrics, subpixel
 * rounding, engine-specific clip-path rasterization) makes one tab's shape cut into the
 * next tab's own rendered text, because the two shapes are two separate elements
 * whose alignment isn't actually guaranteed by the browser, just by both browsers this
 * session could check agreeing on the arithmetic.
 *
 * This version can't have that failure mode: every step sizes to its own label content
 * (`flex-initial`, the ordinary flex default) with `min-width: 0` and `overflow: hidden`,
 * so steps can never overlap -- the browser itself enforces that from ordinary flex
 * layout, not from two elements' shapes lining up by coincidence. The chevron is a small
 * icon *inside* each step's own box (not a shape extending into the next step), so it can
 * never paint over another step's label. Labels only truncate with an ellipsis in the
 * (now rare) case where the container itself is too narrow to fit every step at its
 * natural width, instead of overlapping a neighbor. The strip sizes to its own content
 * (`inline-flex`, no `w-full`) rather than stretching every step equally across the full
 * available width.
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
    <nav aria-label="Product sections" className="inline-flex max-w-full overflow-hidden rounded-md text-sm">
      {tabs.map((tab, i) => {
        const isActive = i === activeIndex;
        const isCompleted = !isActive && Boolean(completed?.[tab.id]);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex h-8 min-w-0 flex-initial items-center justify-center gap-1 overflow-hidden px-3 font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : isCompleted
                  ? "bg-primary/20 text-primary hover:bg-primary/30"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{tab.label}</span>
            {i < tabs.length - 1 ? (
              <ChevronRight
                className={cn(
                  "size-3.5 shrink-0",
                  isActive ? "text-primary-foreground/70" : "text-current opacity-50",
                )}
                aria-hidden="true"
              />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
