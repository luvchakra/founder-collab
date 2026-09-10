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

// Fixed display order so every role card groups its permissions the same way --
// modules not in this list (future ones) just sort alphabetically after these.
const MODULE_ORDER = ["core", "discovery", "inventory", "fsm", "crm", "gst"];
const MODULE_LABEL: Record<string, string> = {
  core: "Platform",
  discovery: "Discovery",
  inventory: "Inventory",
  fsm: "Service",
  crm: "CRM",
  gst: "GST",
};

function groupByModule<T extends { module: string }>(items: T[]): [string, T[]][] {
  const byModule = new Map<string, T[]>();
  for (const item of items) {
    const list = byModule.get(item.module) ?? [];
    list.push(item);
    byModule.set(item.module, list);
  }
  return [...byModule.entries()].sort(([a], [b]) => {
    const ai = MODULE_ORDER.indexOf(a);
    const bi = MODULE_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

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
            const groups = groupByModule(grantedPermissions);
            return (
              <div key={role} className="flex flex-col gap-3 rounded-2xl border border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{ROLE_LABEL[role]}</p>
                  <Badge variant="outline" className="shrink-0 text-xs font-normal text-muted-foreground">
                    {grantedPermissions.length} {grantedPermissions.length === 1 ? "permission" : "permissions"}
                  </Badge>
                </div>
                {grantedPermissions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">View-only. No write access.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {groups.map(([module, permissions]) => (
                      <div key={module}>
                        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                          {MODULE_LABEL[module] ?? module}
                        </p>
                        <ul className="mt-1.5 flex flex-col gap-1 text-sm text-muted-foreground">
                          {permissions.map((p) => (
                            <li key={p.key} className="flex gap-2">
                              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/50" aria-hidden="true" />
                              <span>{p.description}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
