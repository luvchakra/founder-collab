import { notFound } from "next/navigation";
import { Shield } from "lucide-react";
import { getBusiness, listBusinessMembers } from "@cofounderai/module-inventory/lib/tenancy/queries";
import { listPermissionCatalog, listRolePermissions } from "@cofounderai/core/rbac/permission-catalog";
import { Badge } from "@cofounderai/core/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { formatDate } from "@cofounderai/core/lib/format";

const ACTIVE_ROLES = [
  "owner",
  "admin",
  "inventory_manager",
  "procurement_manager",
  "sales_manager",
  "accountant",
  "warehouse_operator",
  "viewer",
] as const;

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  inventory_manager: "Inventory Manager",
  procurement_manager: "Procurement Manager",
  sales_manager: "Sales Manager",
  accountant: "Accountant",
  warehouse_operator: "Warehouse Operator",
  viewer: "Viewer",
};

/** Ported from stockpilot-ai-ops's routes/_authenticated/team.tsx -- read-only:
 * permissions are set by role, not per person, until custom roles ship (matches the
 * original's own scope exactly). */
export default async function TeamPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [members, catalog, rolePermissions] = await Promise.all([
    listBusinessMembers(businessId),
    listPermissionCatalog(),
    listRolePermissions(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Members, their role, and exactly what that role can do for {business.name}. Read-only --
          permissions are set by role, not per person, until custom roles ship.
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="font-medium">{m.full_name || "-"}</div>
                  <div className="text-xs text-muted-foreground">{m.email ?? m.user_id}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{ROLE_LABEL[m.role] ?? m.role}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(m.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div>
        <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
          <Shield className="size-4" aria-hidden="true" />
          Roles &amp; permissions
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          The eight default roles and exactly what each one can do. Custom roles aren&apos;t
          available yet.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ACTIVE_ROLES.map((role) => {
            const granted = rolePermissions[role] ?? new Set<string>();
            const grantedPermissions = catalog.filter((p) => granted.has(p.key));
            return (
              <div key={role} className="rounded-2xl border border-border p-4">
                <p className="font-medium">{ROLE_LABEL[role]}</p>
                {grantedPermissions.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">View-only. No write access.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                    {grantedPermissions.map((p) => (
                      <li key={p.key}>{p.description}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
