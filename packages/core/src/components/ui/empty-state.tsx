import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";

/**
 * Platform-wide "no items yet" placeholder for a list/table (UI-UX-UNIFORMITY.md §1c).
 * 26 call sites across inventory/fsm/crm hand-rolled one of two byte-identical Tailwind
 * patterns before this existed -- `panel` (icon + rounded-2xl/p-12, full list/table
 * pages) and `inline` (text-only rounded-lg/p-8, tabs/sub-sections within a page).
 * Dashboard-widget empty states (already borderless-by-design inside a `Card`) are a
 * different convention on purpose, not covered here.
 */
export function EmptyState({
  icon: Icon,
  message,
  variant = "panel",
  className,
}: {
  icon?: LucideIcon;
  message: string;
  variant?: "panel" | "inline";
  className?: string;
}) {
  if (variant === "inline") {
    return (
      <p
        className={cn(
          "rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        {message}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border p-12 text-center",
        className,
      )}
    >
      {Icon ? <Icon className="size-8 text-muted-foreground" aria-hidden="true" /> : null}
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
