import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Info, Minus, ShieldCheck, Users } from "lucide-react";
import { listBusinessMembers, listBusinessRoles, listPermissionCatalogue } from "@cofounderai/core/rbac/members";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { Badge } from "@cofounderai/core/ui/badge";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { cn } from "@cofounderai/core/lib/utils";
import { buildAccessValue, loadAccessContext } from "../../users/access-data";
import { AccessProvider } from "../../users/access-context";
import {
  accessBreadcrumbs,
  displayName,
  groupPermissions,
  isHighRiskPermission,
  MemberAvatar,
  MemberStatusBadge,
  ModuleAccessList,
  NoMembersPermission,
  permissionCountLabel,
  RoleTypeBadge,
} from "../../users/access-ui";
import { MemberActions } from "../../users/member-actions";
import { RoleForm } from "../role-form";
import { ArchiveRoleButton } from "./archive-role-button";

/**
 * RBAC-26/28/29 (§15, §25) -- one role: what it grants and who holds it. A custom role
 * can be edited and archived by someone with members.roles.manage; system roles are
 * read-only for every business (§14).
 */
export default async function RoleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string; roleId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { businessSlug, roleId } = await params;
  const { tab } = await searchParams;
  const context = await loadAccessContext(businessSlug);
  const { business, can } = context;

  if (!can.view) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6">
        <PageHeader
          title="Role"
          breadcrumbs={accessBreadcrumbs(business.name, businessSlug, [{ label: "Roles", href: `/${businessSlug}/admin/roles` }, { label: "Role" }])}
        />
        <NoMembersPermission />
      </main>
    );
  }

  const [roles, catalogue, members] = await Promise.all([
    listBusinessRoles(context.businessId, { includeArchived: true }),
    listPermissionCatalogue(),
    listBusinessMembers(context.businessId),
  ]);
  const role = roles.find((r) => r.id === roleId);
  if (!role) notFound();
  const holders = members.filter((m) => m.roleId === role.id);
  const editable = role.roleType === "custom" && !role.archived && can.manageRoles;
  const showUsers = tab === "users";
  const granted = new Set(role.key === "owner" ? catalogue.map((p) => p.key) : role.permissionKeys);
  const groups = groupPermissions(catalogue);
  const base = `/${businessSlug}/admin/roles/${role.id}`;

  return (
    <AccessProvider value={buildAccessValue(businessSlug, context, roles, catalogue)}>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6">
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              {role.name}
              <RoleTypeBadge roleType={role.roleType} />
              {role.archived ? <Badge variant="secondary">Archived</Badge> : null}
            </span>
          }
          description={role.description ?? undefined}
          breadcrumbs={accessBreadcrumbs(business.name, businessSlug, [{ label: "Roles", href: `/${businessSlug}/admin/roles` }, { label: role.name }])}
          actions={editable ? <ArchiveRoleButton businessSlug={businessSlug} roleId={role.id} roleName={role.name} /> : null}
        />

        <dl className="grid grid-cols-3 gap-4 rounded-xl border bg-card p-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Role type</dt>
            <dd className="font-medium">{role.roleType === "system" ? "System role" : "Custom role"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Applied to</dt>
            <dd className="font-medium">
              {role.memberCount} {role.memberCount === 1 ? "user" : "users"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Permissions</dt>
            <dd className="font-medium">{permissionCountLabel(role)}</dd>
          </div>
        </dl>

        {role.roleType === "system" ? (
          <p className="flex items-start gap-2 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              System roles can&apos;t be edited — create a custom role instead.
              {can.manageRoles ? (
                <>
                  {" "}
                  <Link href={`/${businessSlug}/admin/roles/new`} className="font-medium text-primary hover:underline">
                    Create a custom role
                  </Link>
                </>
              ) : null}
            </span>
          </p>
        ) : null}

        <nav aria-label="Role sections" className="flex gap-1 overflow-x-auto border-b">
          {[
            { href: base, label: "Permissions", active: !showUsers, icon: ShieldCheck },
            { href: `${base}?tab=users`, label: `Users (${holders.length})`, active: showUsers, icon: Users },
          ].map((t) => (
            <Link
              key={t.label}
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={cn(
                "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
                t.active ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="size-4" aria-hidden="true" />
              {t.label}
            </Link>
          ))}
        </nav>

        {showUsers ? (
          holders.length === 0 ? (
            <EmptyState icon={Users} message="Nobody has this role yet." />
          ) : (
            <ul className="flex flex-col divide-y rounded-xl border bg-card">
              {holders.map((m) => (
                <li key={m.id} className="flex items-center gap-3 p-4">
                  <MemberAvatar name={m.name} email={m.email} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/${businessSlug}/admin/users/${m.id}`} className="font-medium hover:underline">
                      {displayName(m)}
                      {m.isMe ? <span className="ml-2 text-xs font-normal text-muted-foreground">(You)</span> : null}
                    </Link>
                    {m.email && m.name ? <p className="truncate text-xs text-muted-foreground">{m.email}</p> : null}
                  </div>
                  <MemberStatusBadge status={m.status} />
                  <MemberActions member={m} />
                </li>
              ))}
            </ul>
          )
        ) : editable ? (
          <RoleForm
            businessSlug={businessSlug}
            groups={groups}
            grantable={context.isOwner ? catalogue.map((p) => p.key) : [...context.permissions]}
            mode="edit"
            initial={{ roleId: role.id, name: role.name, description: role.description ?? "", permissionKeys: role.permissionKeys }}
            cancelHref={`/${businessSlug}/admin/roles`}
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-[1fr_16rem]">
            <div className="flex flex-col gap-3">
              {groups.map((g) => {
                const count = g.permissions.filter((p) => granted.has(p.key)).length;
                return (
                  <section key={g.module} className="rounded-xl border bg-card">
                    <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
                      <h2 className="text-sm font-medium">{g.label}</h2>
                      <span className="text-xs text-muted-foreground">
                        {count} of {g.permissions.length}
                      </span>
                    </div>
                    <ul className="flex flex-col">
                      {g.permissions.map((p) => {
                        const on = granted.has(p.key);
                        return (
                          <li key={p.key} className="flex items-start gap-3 px-4 py-2 text-sm">
                            {on ? (
                              <Check className="mt-0.5 size-4 shrink-0 text-success-subtle" aria-label="Granted" />
                            ) : (
                              <Minus className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" aria-label="Not granted" />
                            )}
                            <span className={cn("flex min-w-0 flex-col gap-0.5", !on && "text-muted-foreground")}>
                              <span className="flex flex-wrap items-center gap-2">
                                {p.description ?? p.key}
                                {on && isHighRiskPermission(p.key) ? <Badge variant="warning">High risk</Badge> : null}
                              </span>
                              <code className="text-xs text-muted-foreground">{p.key}</code>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
            <aside className="flex h-fit flex-col gap-3 rounded-xl border bg-card p-4">
              <h2 className="text-sm font-medium">Module access</h2>
              <ModuleAccessList role={role} />
            </aside>
          </div>
        )}
      </main>
    </AccessProvider>
  );
}
