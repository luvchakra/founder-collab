import { Badge } from "@cofounderai/core/ui/badge";
import type { JourneyModuleSection, JourneyStageStatus } from "@cofounderai/module-crm/lib/journey/types";

const VARIANT_BY_STATUS: Record<JourneyStageStatus, "secondary" | "default" | "destructive" | "outline"> = {
  ok: "secondary",
  warning: "default",
  blocked: "destructive",
  not_available: "outline",
  not_applicable: "outline",
};

/** INT-01.1's compact per-module journey rendering ("Discovery ✓ / CRM ✓ / Inventory ⚠
 * / FSM —") -- one badge per module, its own doc comment's example rendering. */
export function JourneyBadge({ module, section }: { module: string; section: JourneyModuleSection }) {
  return (
    <Badge variant={VARIANT_BY_STATUS[section.status]} className="font-normal">
      {module}: {section.label}
    </Badge>
  );
}
