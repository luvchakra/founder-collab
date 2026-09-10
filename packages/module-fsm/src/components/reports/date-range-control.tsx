import { cn } from "@cofounderai/core/lib/utils";

export type ReportRangePreset = "7d" | "30d" | "90d" | "month" | "year" | "all";

const PRESETS: { key: ReportRangePreset; label: string }[] = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];

/** Resolves a preset key to an inclusive `{from, to}` date range (plain YYYY-MM-DD),
 * `to` always today. "all" returns an unbounded range -- the previous, pre-date-range
 * behavior for every report except timecards/productivity, so picking it never hides
 * data a user could already see. */
export function resolveReportRange(preset: string | undefined): { from?: string; to?: string } {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);

  switch (preset) {
    case "7d":
    case "30d":
    case "90d": {
      const days = Number(preset.replace("d", ""));
      const from = new Date(today);
      from.setDate(from.getDate() - (days - 1));
      return { from: from.toISOString().slice(0, 10), to };
    }
    case "month": {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: from.toISOString().slice(0, 10), to };
    }
    case "year": {
      const from = new Date(today.getFullYear(), 0, 1);
      return { from: from.toISOString().slice(0, 10), to };
    }
    default:
      return {};
  }
}

/** Plain links (not a client component) -- switching `?range=` re-renders this Server
 * Component page with fresh data; the Tabs below stay mounted throughout (same tree
 * position), so the active report tab survives the navigation even though this control
 * needs no client JS of its own. */
export function DateRangeControl({ basePath, active }: { basePath: string; active: ReportRangePreset }) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/40 p-1" role="group" aria-label="Date range">
      {PRESETS.map((preset) => (
        <a
          key={preset.key}
          href={preset.key === "all" ? basePath : `${basePath}?range=${preset.key}`}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
            active === preset.key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
          )}
        >
          {preset.label}
        </a>
      ))}
    </div>
  );
}
