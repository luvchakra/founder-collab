// RBAC-12 / RBAC-29 -- the Roles page: system roles, then custom roles, with members and permissions.
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { listBusinessRoles, type BusinessRoleSummary } from "@cofounderai/core/rbac/members";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { Button } from "@cofounderai/core/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { loadAccessContext } from "../users/access-data";
import { AccessTabs, accessBreadcrumbs, NoMembersPermission, permissionCountLabel, RoleTypeBadge } from "../users/access-ui";

/**
 * RBAC-26 (§26) -- the business's roles: the system roles every business has, then its
 * own custom roles. Counts come from the live grants and memberships, not a cached copy.
 */
export default async function RolesPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const context = await loadAccessContext(businessSlug);
  const { business, can } = context;
  const breadcrumbs = accessBreadcrumbs(business.name, businessSlug, [{ label: "Roles" }]);

  if (!can.view) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6">
        <PageHeader title="Users & Access" breadcrumbs={breadcrumbs} />
        <NoMembersPermission />
      </main>
    );
  }

  const roles = await listBusinessRoles(context.businessId);
  const system = roles.filter((r) => r.roleType === "system");
  const custom = roles.filter((r) => r.roleType === "custom");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6">
      <PageHeader
        title="Users & Access"
        description="Roles decide what people can see and do. System roles are built in; custom roles are your own."
        breadcrumbs={breadcrumbs}
        actions={
          can.manageRoles ? (
            <Button asChild>
              <Link href={`/${businessSlug}/admin/roles/new`}>
                <Plus aria-hidden="true" /> Create role
              </Link>
            </Button>
          ) : null
        }
      />
      <AccessTabs businessSlug={businessSlug} active="roles" />

      <RoleSection title="System roles" roles={system} businessSlug={businessSlug} />
      <RoleSection
        title="Custom roles"
        roles={custom}
        businessSlug={businessSlug}
        empty={can.manageRoles ? "No custom roles yet. Create one to give people exactly the access they need." : "No custom roles yet."}
      />
    </main>
  );
}

function RoleSection({ title, roles, businessSlug, empty }: { title: string; roles: BusinessRoleSummary[]; businessSlug: string; empty?: string }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {roles.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border bg-card sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="text-right">Permissions</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Open</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/${businessSlug}/admin/roles/${r.id}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      {r.description ? <p className="max-w-md text-xs text-muted-foreground">{r.description}</p> : null}
                    </TableCell>
                    <TableCell>
                      <RoleTypeBadge roleType={r.roleType} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.memberCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{permissionCountLabel(r)}</TableCell>
                    <TableCell>
                      <Link href={`/${businessSlug}/admin/roles/${r.id}`} aria-label={`Open ${r.name}`} className="text-muted-foreground hover:text-foreground">
                        <ChevronRight className="size-4" aria-hidden="true" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col gap-3 sm:hidden">
            {roles.map((r) => (
              <li key={r.id}>
                <Link href={`/${businessSlug}/admin/roles/${r.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{r.name}</span>
                      <RoleTypeBadge roleType={r.roleType} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {r.memberCount} {r.memberCount === 1 ? "user" : "users"} · {permissionCountLabel(r)} permissions
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
