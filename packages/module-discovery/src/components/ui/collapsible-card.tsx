"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@cofounderai/core/lib/utils";

/** Bordered card collapsed by default behind a header row with a downward chevron that
 * rotates open -- for a section whose contents (a form, a filter panel) don't need to be
 * visible until asked for. */
export function CollapsibleCard({
  label,
  defaultOpen = false,
  children,
}: {
  label: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-accent"
      >
        {label}
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {open ? <div className="flex flex-col gap-3 border-t p-4">{children}</div> : null}
    </div>
  );
}
