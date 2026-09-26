import { redirect } from "next/navigation";

/**
 * The old read-only "Team" page (members + the eight fixed roles) is superseded by
 * Users & Access (docs/plan/15-MULTI-USER-RBAC-BACKLOG.md §20): users, custom roles,
 * invitations and activity under `admin/users` and `admin/roles`. Kept as a redirect so
 * existing links and bookmarks still land somewhere useful.
 */
export default async function TeamPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  redirect(`/${businessSlug}/admin/users`);
}
