"use client";

import { useState } from "react";
import { cn } from "@cofounderai/core/lib/utils";

/** Read-only single-line preview of `text`, click to expand to the full text (and click
 * again to collapse) -- unlike EditableText, this never edits anything, just reveals
 * more of what's already there. */
export function ExpandableText({ text, className }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expanded}
      className={cn("block text-left", className)}
    >
      <p className={cn(!expanded && "truncate")}>{text}</p>
    </button>
  );
}
