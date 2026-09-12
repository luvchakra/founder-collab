import { AlertTriangle, Clock, Info } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { cn } from "@cofounderai/core/lib/utils";
import type { RiskSeverity } from "../../lib/risk/types";

/**
 * COMPLY-P0-11.5 (Clear Status Hierarchy): "Never rely on color alone." Every severity
 * gets its own icon AND its own text label, with color as a third, reinforcing signal --
 * not the only one. `"high"` reuses the platform's existing `destructive` badge variant;
 * `"medium"` uses the theme's own `warning` token (no built-in badge variant for it, so
 * applied as a small class override rather than widening `badgeVariants` for one caller);
 * `"low"` uses the existing `secondary` variant.
 */
const SEVERITY_CONFIG: Record<RiskSeverity, { label: string; icon: typeof AlertTriangle; className: string }> = {
  high: { label: "High", icon: AlertTriangle, className: "" },
  medium: {
    label: "Medium",
    icon: Clock,
    className: "border-warning/30 bg-warning/15 text-warning-foreground",
  },
  low: { label: "Low", icon: Info, className: "" },
};

export function SeverityBadge({ severity }: { severity: RiskSeverity }) {
  const config = SEVERITY_CONFIG[severity];
  const Icon = config.icon;
  return (
    <Badge variant={severity === "high" ? "destructive" : severity === "low" ? "secondary" : "outline"} className={cn("gap-1", config.className)}>
      <Icon className="size-3" aria-hidden="true" />
      {config.label}
    </Badge>
  );
}
