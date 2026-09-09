"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@cofounderai/core/lib/utils";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";

/**
 * A single ICP field inside the page's shared "Save changes" form -- defaults to a
 * clamped, read-only view (so a long list of pain points/roles/etc. doesn't turn the
 * page into a wall of open textareas at once) with its own "Edit" toggle and a
 * "Show more" expand for content past ~5 lines. Submits under the same `name` either
 * way -- a hidden input carries the value while collapsed, the real Textarea takes over
 * once editing -- so the page's one shared submit button still saves every field
 * regardless of which ones were opened.
 */
export function IcpField({
  label,
  name,
  defaultValue,
  rows = 5,
}: {
  label: string;
  name: string;
  defaultValue: string;
  rows?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState(defaultValue);

  const isLong = value.split("\n").length > 5 || value.length > 240;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={editing ? name : undefined}>{label}</Label>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Pencil className="size-3" aria-hidden="true" />
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      {editing ? (
        <Textarea
          id={name}
          name={name}
          rows={rows}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
      ) : (
        <>
          {value.trim() ? (
            <p className={cn("whitespace-pre-line text-sm", !expanded && isLong && "line-clamp-5")}>
              {value}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Not set.</p>
          )}
          {isLong ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="self-start text-xs text-primary hover:underline"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          ) : null}
          <input type="hidden" name={name} value={value} />
        </>
      )}
    </div>
  );
}
