import Link from "next/link";
import { notFound } from "next/navigation";
import { listBusinessMembers, listBusinessRoles, listPermissionCatalogue } from "@cofounderai/core/rbac/members";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { buildAccessValue, loadAccessContext } from "../access-data";
import { AccessProvider } from "../access-context";
import {
  accessBreadcrumbs,
  displayName,
  formatDay,
  MemberAvatar,
  MemberStatusBadge,
  ModuleAccessList,
  NoMembersPermission,
  permissionCountLabel,
  RoleTypeBadge,
} from "../access-ui";
import { MemberActions } from "../member-actions";

/**
 * RBAC-23 (§23) -- one person's access to *this* business: role, status, what the role
 * opens, and the actions the viewer may take. Their global identity (profile, other
 * businesses) is theirs, not this business's, and isn't shown here.
 */
export default async function MemberDetailPage({ params }: { params: Promise<{ businessSlug: string; memberId: string }> }) {
  const { businessSlug, memberId } = await params;
  const context = await loadAccessContext(businessSlug);
  const { business, can } = context;

  if (!can.view) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6">
        <PageHeader title="User details" breadcrumbs={accessBreadcrumbs(business.name, businessSlug, [{ label: "User" }])} />
        <NoMembersPermission />
      </main>
    );
  }

  const [members, roles, catalogue] = await Promise.all([
    listBusinessMembers(context.businessId),
    listBusinessRoles(context.businessId),
    listPermissionCatalogue(),
  ]);
  const member = members.find((m) => m.id === memberId);
  if (!member) notFound();
  const role = roles.find((r) => r.id === member.roleId);
  const name = displayName(member);

  return (
    <AccessProvider value={buildAccessValue(businessSlug, context, roles, catalogue)}>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6">
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              <MemberAvatar name={member.name} email={member.email} className="size-11 text-sm" />
              <span className="min-w-0">
                <span className="block truncate">
                  {name}
                  {member.isMe ? <span className="ml-2 text-sm font-normal text-muted-foreground">(You)</span> : null}
                </span>
                {member.email && member.name ? <span className="block truncate text-sm font-normal text-muted-foreground">{member.email}</span> : null}
              </span>
            </span>
          }
          breadcrumbs={accessBreadcrumbs(business.name, businessSlug, [{ label: name }])}
          actions={<MemberStatusBadge status={member.status} />}
        />

        <div className="grid gap-6 md:grid-cols-2">
          <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
            <h2 className="text-base font-semibold">Access to {business.name}</h2>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="truncate font-medium">{member.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Role</dt>
                <dd className="flex flex-wrap items-center gap-2 font-medium">
                  <Link href={`/${businessSlug}/admin/roles/${member.roleId}`} className="text-primary hover:underline">
                    {member.roleName}
                  </Link>
                  <RoleTypeBadge roleType={member.roleType} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="mt-0.5">
                  <MemberStatusBadge status={member.status} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Joined</dt>
                <dd className="font-medium">{formatDay(member.joinedAt ?? member.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Permissions</dt>
                <dd className="font-medium">{role ? `${permissionCountLabel(role)} granted` : "—"}</dd>
              </div>
            </dl>
            {member.status === "suspended" ? (
              <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
                Suspended members keep their role but can&apos;t open this business until they&apos;re reactivated.
              </p>
            ) : null}
          </section>

          <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
            <div>
              <h2 className="text-base font-semibold">Module access</h2>
              <p className="text-sm text-muted-foreground">What the {member.roleName} role can open. Change it by changing the role.</p>
            </div>
            {role ? <ModuleAccessList role={role} /> : <p className="text-sm text-muted-foreground">Role not available.</p>}
          </section>
        </div>

        <MemberActions member={member} variant="buttons" />
      </main>
    </AccessProvider>
  );
}
