import { listBusinessRoles, listPermissionCatalogue, listRoleTemplates } from "@cofounderai/core/rbac/members";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { loadAccessContext } from "../../users/access-data";
import { accessBreadcrumbs, groupPermissions } from "../../users/access-ui";
import { RoleForm } from "../role-form";

/**
 * RBAC-27 (§13, §14) -- "Create custom role". Starting from a template or an existing
 * role copies its permissions into the new role once; the template changing later never
 * silently changes this role (§14).
 */
export default async function NewRolePage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const context = await loadAccessContext(businessSlug);
  const { business, can } = context;
  const breadcrumbs = accessBreadcrumbs(business.name, businessSlug, [{ label: "Roles", href: `/${businessSlug}/admin/roles` }, { label: "New role" }]);

  if (!can.manageRoles) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
        <PageHeader title="Create custom role" breadcrumbs={breadcrumbs} />
        <p role="status" className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          You don&apos;t have permission to create roles in this business. Contact your business administrator.
        </p>
      </main>
    );
  }

  const [catalogue, templates, roles] = await Promise.all([listPermissionCatalogue(), listRoleTemplates(), listBusinessRoles(context.businessId)]);
  const grantable = context.isOwner ? catalogue.map((p) => p.key) : [...context.permissions];
  const bases = [
    {
      group: "Templates",
      options: templates.map((t) => ({ value: `template:${t.key}`, label: t.name, permissionKeys: t.permissionKeys, templateKey: t.key, description: t.description })),
    },
    {
      group: "Existing roles",
      options: roles
        .filter((r) => r.key !== "owner")
        .map((r) => ({ value: `role:${r.id}`, label: r.name, permissionKeys: r.permissionKeys, templateKey: null, description: r.description })),
    },
  ].filter((b) => b.options.length > 0);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <PageHeader title="Create custom role" description="Define a new role with exactly the permissions it needs." breadcrumbs={breadcrumbs} />
      <RoleForm
        businessSlug={businessSlug}
        groups={groupPermissions(catalogue)}
        grantable={grantable}
        mode="create"
        initial={{ name: "", description: "", permissionKeys: [] }}
        bases={bases}
        cancelHref={`/${businessSlug}/admin/roles`}
      />
    </main>
  );
}
