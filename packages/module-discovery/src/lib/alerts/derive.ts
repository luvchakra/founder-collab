import type { AccountWorkspaceEntry } from "../dashboard/queries";
import type { WorkspaceUsage } from "../usage/types";
import { creditsUsedPercent } from "../usage/format";

export type Alert = {
  id: string;
  severity: "warning" | "info";
  message: string;
  href: string;
};

/**
 * Derived, non-persisted notifications -- no `alerts` table, nothing to migrate. Every
 * alert is recomputed from data the app already has each time the header renders (see
 * app/(dashboard)/layout.tsx), so it's always current for free and there's nothing to
 * keep in sync. Deliberately excludes ICP status: that would need one more query per
 * workspace, and profile/usage/next-action already cover the cases that actually need a
 * founder's attention. Read/unread (components/alerts/alert-bell.tsx) is tracked
 * separately, client-side only, keyed by each alert's stable `id` below.
 */
export function deriveAccountAlerts(input: {
  entries: AccountWorkspaceEntry[];
  usageByWorkspace: Record<string, WorkspaceUsage>;
  prospects: { workspace_id: string; nextAction: string | null }[];
}): Alert[] {
  const { entries, usageByWorkspace, prospects } = input;
  const alerts: Alert[] = [];

  const needsActionByWorkspace = new Map<string, number>();
  for (const p of prospects) {
    if (p.nextAction !== null) {
      needsActionByWorkspace.set(p.workspace_id, (needsActionByWorkspace.get(p.workspace_id) ?? 0) + 1);
    }
  }

  for (const { workspace, product, business } of entries) {
    const basePath = `/dashboard/businesses/${business.id}/products/${product.id}`;

    const usage = usageByWorkspace[workspace.id];
    if (usage) {
      const percent = creditsUsedPercent(usage.totalCost);
      if (percent >= 100) {
        alerts.push({
          id: `usage-limit-${workspace.id}`,
          severity: "warning",
          message: `${product.name} has used its free-tier AI credits this month.`,
          href: `${basePath}/usage`,
        });
      } else if (percent >= 80) {
        alerts.push({
          id: `usage-warn-${workspace.id}`,
          severity: "info",
          message: `${product.name} has used ${percent}% of its AI credits this month.`,
          href: `${basePath}/usage`,
        });
      }
    }

    if (!product.product_profile) {
      alerts.push({
        id: `profile-${product.id}`,
        severity: "info",
        message: `${product.name} has no product profile yet.`,
        href: basePath,
      });
    }

    const needsAction = needsActionByWorkspace.get(workspace.id) ?? 0;
    if (needsAction > 0) {
      alerts.push({
        id: `next-action-${workspace.id}`,
        severity: "info",
        message: `${product.name} has ${needsAction} prospect${needsAction === 1 ? "" : "s"} needing a next action.`,
        href: `${basePath}/prospects`,
      });
    }
  }

  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "warning" ? -1 : 1));
}
