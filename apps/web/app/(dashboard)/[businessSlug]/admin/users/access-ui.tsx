import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { moduleRegistry } from "@cofounderai/module-registry";
import { ModuleIcon } from "@cofounderai/core/shell/module-icon";
import { StatusBadge } from "@cofounderai/core/ui/status-badge";
import { Badge } from "@cofounderai/core/ui/badge";
import { cn } from "@cofounderai/core/lib/utils";
import type { PermissionEntry } from "@cofounderai/core/rbac/members";

/**
 * RBAC-21..27 -- the small pieces every Users & Access screen shares (users, roles,
 * invitations, activity). Presentation only and free of server imports, so the client
 * components (invite dialog, member actions, role editor) can use them too.
 */

export type AccessTab = "users" | "roles" | "invitations" | "activity";

const TABS: { key: AccessTab; label: string; href: (slug: string) => string }[] = [
  { key: "users", label: "Users", href: (s) => `/${s}/admin/users` },
  { key: "roles", label: "Roles", href: (s) => `/${s}/admin/roles` },
  { key: "invitations", label: "Invitations", href: (s) => `/${s}/admin/users/invitations` },
  { key: "activity", label: "Activity", href: (s) => `/${s}/admin/users/activity` },
];

export function AccessTabs({ businessSlug, active }: { businessSlug: string; active: AccessTab }) {
  return (
    <nav aria-label="Users and access sections" className="flex gap-1 overflow-x-auto border-b">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href(businessSlug)}
          aria-current={active === tab.key ? "page" : undefined}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
            active === tab.key ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export function accessBreadcrumbs(businessName: string, businessSlug: string, trail: { label: string; href?: string }[] = []) {
  return [
    { label: businessName, href: `/${businessSlug}/business` },
    trail.length > 0 ? { label: "Users & Access", href: `/${businessSlug}/admin/users` } : { label: "Users & Access" },
    ...trail,
  ];
}

/** §31 -- a member without members.view gets a plain sentence, never an error page. */
export function NoMembersPermission() {
  return (
    <div role="status" className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-10 text-center">
      <ShieldAlert className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="max-w-md text-sm text-muted-foreground">
        You don&apos;t have permission to see this business&apos;s members. Contact your business administrator.
      </p>
    </div>
  );
}

export function formatDay(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function displayName(member: { name: string | null; email: string | null }): string {
  return member.name?.trim() || member.email || "Unnamed member";
}

function initials(label: string): string {
  const parts = label.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

const AVATAR_TONES = [
  "bg-primary/10 text-primary",
  "bg-success/12 text-success-subtle",
  "bg-warning/15 text-warning-subtle",
  "bg-destructive/10 text-destructive-subtle",
  "bg-muted text-muted-foreground",
];

export function MemberAvatar({ name, email, className }: { name: string | null; email: string | null; className?: string }) {
  const label = displayName({ name, email });
  let hash = 0;
  for (const ch of label) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        AVATAR_TONES[hash % AVATAR_TONES.length],
        className,
      )}
    >
      {initials(label)}
    </span>
  );
}

const MEMBER_STATUS_LABEL: Record<string, string> = { active: "Active", suspended: "Suspended", invited: "Invited", removed: "Removed" };

export function MemberStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status} label={MEMBER_STATUS_LABEL[status]} tone={status === "invited" ? "warning" : undefined} />;
}

const INVITATION_TONE = { pending: "warning", accepted: "success", expired: "secondary", revoked: "destructive" } as const;

export function InvitationStatusBadge({ status }: { status: keyof typeof INVITATION_TONE }) {
  return <StatusBadge status={status} tone={INVITATION_TONE[status]} />;
}

export function RoleTypeBadge({ roleType }: { roleType: "system" | "custom" }) {
  return roleType === "system" ? <Badge variant="secondary">System</Badge> : <Badge variant="default">Custom</Badge>;
}

// ---------------------------------------------------------------------------------------
// Permissions, grouped the way the editor and role pages show them
// ---------------------------------------------------------------------------------------

const MODULE_ORDER = ["core", "discovery", "inventory", "fsm", "crm", "gst"];

export const MODULE_GROUP_LABEL: Record<string, string> = {
  core: "Business & people",
  discovery: "Discovery, Marketing & Funding",
  inventory: "Inventory",
  fsm: "Field Service",
  crm: "CRM",
  gst: "Finance",
};

export type PermissionGroup = { module: string; label: string; permissions: PermissionEntry[] };

export function groupPermissions(catalogue: PermissionEntry[]): PermissionGroup[] {
  const byModule = new Map<string, PermissionEntry[]>();
  for (const p of catalogue) byModule.set(p.module, [...(byModule.get(p.module) ?? []), p]);
  return [...byModule.entries()]
    .sort(([a], [b]) => {
      const ai = MODULE_ORDER.indexOf(a);
      const bi = MODULE_ORDER.indexOf(b);
      if (ai === -1 || bi === -1) return ai === bi ? a.localeCompare(b) : ai === -1 ? 1 : -1;
      return ai - bi;
    })
    .map(([module, permissions]) => ({
      module,
      label: MODULE_GROUP_LABEL[module] ?? module,
      permissions: [...permissions].sort((a, b) => a.key.localeCompare(b.key)),
    }));
}

/** §25 "high-risk permissions should be visibly marked": anything that moves money,
 * takes data out, removes people or hands out authority. */
export function isHighRiskPermission(key: string): boolean {
  return /(^billing\.|\.export$|\.reports\.export$|\.manage$|\.remove$|\.delete$|^members\.roles\.|payment)/.test(key);
}

/** Owner holds every business permission by definition (core.has_business_permission). */
export function permissionCountLabel(role: { key: string; permissionKeys: string[] }): string {
  if (role.key === "owner") return "All";
  return String(role.permissionKeys.length);
}

/**
 * Mirrors the privilege ceiling (§12, §41) so the UI can grey out what the server would
 * refuse anyway: the owner role is never assignable here (ownership moves only through
 * Transfer ownership), and a non-owner may hand out a role only when they hold every
 * permission in it.
 */
export function canAssignRole(role: { key: string; permissionKeys: string[] }, viewerPermissions: ReadonlySet<string> | string[], viewerIsOwner: boolean): boolean {
  if (role.key === "owner") return false;
  if (viewerIsOwner) return true;
  const held = viewerPermissions instanceof Set ? viewerPermissions : new Set(viewerPermissions);
  return role.permissionKeys.every((k) => held.has(k));
}

// ---------------------------------------------------------------------------------------
// Module access -- which modules a role's permissions open (§30)
// ---------------------------------------------------------------------------------------

const MODULE_ACCESS: { key: string; permission: string; label: string }[] = [
  { key: "discovery", permission: "discovery.view", label: "Discovery" },
  { key: "inventory", permission: "inventory.view", label: "Inventory" },
  { key: "fsm", permission: "service.view", label: "Field Service" },
  { key: "crm", permission: "crm.view", label: "CRM" },
  { key: "gst", permission: "finance.view", label: "Finance" },
];

export function moduleAccessFor(role: { key: string; permissionKeys: string[] }) {
  const keys = new Set(role.permissionKeys);
  return MODULE_ACCESS.map((m) => ({
    ...m,
    icon: moduleRegistry.find((r) => r.key === m.key)?.icon ?? "Shield",
    allowed: role.key === "owner" || keys.has(m.permission),
  }));
}

export function ModuleAccessList({ role, compact = false }: { role: { key: string; permissionKeys: string[] }; compact?: boolean }) {
  const modules = moduleAccessFor(role);
  if (compact) {
    const allowed = modules.filter((m) => m.allowed);
    if (allowed.length === 0) return <span className="text-xs text-muted-foreground">None</span>;
    return (
      <span className="flex items-center gap-1">
        {allowed.map((m) => (
          <span key={m.key} title={m.label} className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ModuleIcon name={m.icon} className="size-3.5" />
            <span className="sr-only">{m.label}</span>
          </span>
        ))}
      </span>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {modules.map((m) => (
        <li key={m.key} className="flex items-center gap-2.5 text-sm">
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-md",
              m.allowed ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            <ModuleIcon name={m.icon} className="size-4" />
          </span>
          <span className={cn("flex-1", !m.allowed && "text-muted-foreground")}>{m.label}</span>
          <span className={cn("text-xs", m.allowed ? "font-medium text-success-subtle" : "text-muted-foreground")}>
            {m.allowed ? "Can open" : "No access"}
          </span>
        </li>
      ))}
    </ul>
  );
}
