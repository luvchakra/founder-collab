"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@cofounderai/core/lib/utils";

const NOTCH = 12;

type StageId = "overview" | "icp" | "prospects" | "conversions";

/** Chevron-shaped tab: a point on the right (unless last) and a matching notch cut into
 * the left (unless first), so consecutive tabs interlock into one continuous arrow strip
 * -- the ServiceNow/wizard "stage tracker" look, not a plain underlined tab row. */
function clipPathFor(index: number, count: number): string {
  const isFirst = index === 0;
  const isLast = index === count - 1;
  const points = ["0 0", isLast ? "100% 0" : `calc(100% - ${NOTCH}px) 0`];
  if (!isLast) points.push("100% 50%");
  points.push(isLast ? "100% 100%" : `calc(100% - ${NOTCH}px) 100%`, "0 100%");
  if (!isFirst) points.push(`${NOTCH}px 50%`);
  return `polygon(${points.join(", ")})`;
}

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
    <nav aria-label="Product sections" className="flex overflow-x-auto text-sm">
      {tabs.map((tab, i) => {
        const isActive = i === activeIndex;
        const isCompleted = !isActive && Boolean(completed?.[tab.id]);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            style={{ clipPath: clipPathFor(i, tabs.length), marginLeft: i === 0 ? 0 : -NOTCH }}
            className={cn(
              "flex h-8 shrink-0 items-center justify-center gap-1.5 pr-4 pl-5 font-medium whitespace-nowrap transition-colors",
              i === 0 && "pl-4",
              isActive
                ? "bg-primary text-primary-foreground"
                : isCompleted
                  ? "bg-primary/20 text-primary hover:bg-primary/30"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
