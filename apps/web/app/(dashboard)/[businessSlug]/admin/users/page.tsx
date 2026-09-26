import Link from "next/link";
import { Search, Users } from "lucide-react";
import { listBusinessMembers, listBusinessRoles, listPermissionCatalogue, type BusinessMember } from "@cofounderai/core/rbac/members";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { buildAccessValue, loadAccessContext } from "./access-data";
import { AccessProvider } from "./access-context";
import { AccessTabs, accessBreadcrumbs, displayName, formatDay, MemberAvatar, MemberStatusBadge, ModuleAccessList, NoMembersPermission } from "./access-ui";
import { InviteDialog } from "./invite-dialog";
import { MemberActions } from "./member-actions";

/**
 * RBAC-21/22 (§20-§22) -- "Users & Access": everyone with access to this business, their
 * role and status, and what the viewer may do about each of them. The list is read under
 * the viewer's own session (RLS shows it only with members.view); the menus only show
 * what the viewer's permissions allow, and every action is re-checked in the database.
 */
export default async function UsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ q?: string; role?: string; status?: string }>;
}) {
  const { businessSlug } = await params;
  const { q = "", role = "", status = "" } = await searchParams;
  const context = await loadAccessContext(businessSlug);
  const { business, can } = context;
  const breadcrumbs = accessBreadcrumbs(business.name, businessSlug);

  if (!can.view) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6">
        <PageHeader title="Users & Access" breadcrumbs={breadcrumbs} />
        <NoMembersPermission />
      </main>
    );
  }

  const [members, roles, catalogue] = await Promise.all([
    listBusinessMembers(context.businessId),
    listBusinessRoles(context.businessId),
    listPermissionCatalogue(),
  ]);
  const access = buildAccessValue(businessSlug, context, roles, catalogue);
  const roleById = new Map(roles.map((r) => [r.id, r]));

  const needle = q.trim().toLowerCase();
  const filtered = members.filter(
    (m) =>
      (!needle || `${m.name ?? ""} ${m.email ?? ""}`.toLowerCase().includes(needle)) &&
      (!role || m.roleId === role) &&
      (!status || m.status === status),
  );
  const filtering = Boolean(needle || role || status);

  return (
    <AccessProvider value={access}>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6">
        <PageHeader
          title="Users & Access"
          description={`Manage the people, roles and permissions for ${business.name}.`}
          breadcrumbs={breadcrumbs}
          actions={can.invite ? <InviteDialog businessSlug={businessSlug} businessName={business.name} roles={access.roles} /> : null}
        />
        <AccessTabs businessSlug={businessSlug} active="users" />

        <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-center" role="search">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input name="q" defaultValue={q} placeholder="Search users…" aria-label="Search users" className="pl-9" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <NativeSelect name="role" defaultValue={role} aria-label="Filter by role" className="sm:w-44">
              <option value="">All roles</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="status" defaultValue={status} aria-label="Filter by status" className="sm:w-36">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </NativeSelect>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="outline">
              Apply
            </Button>
            {filtering ? (
              <Button asChild variant="ghost">
                <Link href={`/${businessSlug}/admin/users`}>Clear</Link>
              </Button>
            ) : null}
          </div>
        </form>

        {filtered.length === 0 ? (
          <EmptyState icon={Users} message={filtering ? "No users match these filters." : "No members yet. Invite someone to get started."} />
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden overflow-x-auto rounded-xl border bg-card sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="hidden lg:table-cell">Module access</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Joined</TableHead>
                    <TableHead className="w-12 text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m) => {
                    const memberRole = roleById.get(m.roleId);
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <MemberIdentity member={m} businessSlug={businessSlug} />
                        </TableCell>
                        <TableCell>
                          <RoleBadge member={m} />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {memberRole ? <ModuleAccessList role={memberRole} compact /> : null}
                        </TableCell>
                        <TableCell>
                          <MemberStatusBadge status={m.status} />
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground md:table-cell">
                          {formatDay(m.joinedAt ?? m.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <MemberActions member={m} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile (§22) */}
            <ul className="flex flex-col gap-3 sm:hidden">
              {filtered.map((m) => (
                <li key={m.id} className="flex items-start gap-3 rounded-xl border bg-card p-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <MemberIdentity member={m} businessSlug={businessSlug} />
                    <div className="flex flex-wrap items-center gap-2 pl-12">
                      <RoleBadge member={m} />
                      <MemberStatusBadge status={m.status} />
                    </div>
                  </div>
                  <MemberActions member={m} />
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              Showing {filtered.length} of {members.length} {members.length === 1 ? "user" : "users"}
            </p>
          </>
        )}
      </main>
    </AccessProvider>
  );
}

function MemberIdentity({ member, businessSlug }: { member: BusinessMember; businessSlug: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <MemberAvatar name={member.name} email={member.email} />
      <div className="min-w-0">
        <Link href={`/${businessSlug}/admin/users/${member.id}`} className="flex items-center gap-2 font-medium hover:underline">
          <span className="truncate">{displayName(member)}</span>
          {member.isMe ? <span className="shrink-0 text-xs font-normal text-muted-foreground">(You)</span> : null}
        </Link>
        {member.email && member.name ? <p className="truncate text-xs text-muted-foreground">{member.email}</p> : null}
      </div>
    </div>
  );
}

function RoleBadge({ member }: { member: BusinessMember }) {
  return (
    <Badge variant={member.roleKey === "owner" ? "default" : member.roleType === "custom" ? "outline" : "secondary"} className="whitespace-nowrap">
      {member.roleName}
    </Badge>
  );
}
