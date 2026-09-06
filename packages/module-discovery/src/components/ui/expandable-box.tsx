"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@cofounderai/core/lib/utils";

const EXPANDED_MAX_HEIGHT = 4000;

/**
 * Clamps `children` to a fixed collapsed height (a bottom fade signals there's more)
 * with a "Show more" control that smoothly transitions to fully expanded. The toggle
 * only renders when the content actually overflows the collapsed height, checked once
 * after mount via scrollHeight -- short content never gets a pointless "Show more".
 */
export function ExpandableBox({
  children,
  collapsedHeight = 168,
}: {
  children: React.ReactNode;
  collapsedHeight?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (el) setOverflowing(el.scrollHeight > collapsedHeight + 1);
  }, [collapsedHeight]);

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={contentRef}
        className="relative overflow-hidden transition-[max-height] duration-300 ease-in-out"
        style={{ maxHeight: expanded ? EXPANDED_MAX_HEIGHT : collapsedHeight }}
      >
        {children}
        {overflowing && !expanded ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />
        ) : null}
      </div>
      {overflowing ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 self-start rounded-md px-1.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
        >
          {expanded ? "Show less" : "Show more"}
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-200",
              expanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      ) : null}
    </div>
  );
}
