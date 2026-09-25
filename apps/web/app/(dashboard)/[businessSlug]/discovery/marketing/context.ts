import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";

/**
 * What every Marketing page needs first: the business behind the slug (404 if the caller
 * cannot see it — RLS makes an unknown and a forbidden business look the same), the
 * section's root path, and whether to render edit/approve controls. Hiding a control is a
 * courtesy only; the server action re-checks the permission and RLS checks it again.
 */
export async function marketingContext(businessSlug: string) {
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const [canManage, canApprove] = await Promise.all([
    hasPermission(businessId, "marketing.manage"),
    hasPermission(businessId, "marketing.approve"),
  ]);
  return { businessId, root: `/${businessSlug}/discovery/marketing`, canManage, canApprove };
}
