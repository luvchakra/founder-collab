import type { ConsoleOrganization } from "@cofounderai/core/admin/platform-organizations";
import { Badge } from "@cofounderai/core/ui/badge";

export function StatusBadge({ status, disabledByOwner }: { status: ConsoleOrganization["status"]; disabledByOwner?: boolean }) {
  if (status === "active") return <Badge variant="success">Active</Badge>;
  if (status === "suspended") return <Badge variant="warning">{disabledByOwner ? "Disabled by owner" : "Suspended"}</Badge>;
  return <Badge variant="outline">Decommissioned</Badge>;
}
