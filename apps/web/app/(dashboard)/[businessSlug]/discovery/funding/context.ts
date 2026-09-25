import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";

/**
 * What every Funding page needs first. `canView` matters more here than in Marketing:
 * funding data is only readable with `funding.view` (RLS enforces it), so a member
 * without it is told so rather than shown empty screens that look like "no data".
 */
export async function fundingContext(businessSlug: string) {
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const [canView, canManage, canApprove] = await Promise.all([
    hasPermission(businessId, "funding.view"),
    hasPermission(businessId, "funding.manage"),
    hasPermission(businessId, "funding.approve"),
  ]);
  return { businessId, businessSlug, root: `/${businessSlug}/discovery/funding`, canView, canManage, canApprove };
}
