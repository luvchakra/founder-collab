import Link from "next/link";
import { History } from "lucide-react";
import { listAuditActors, listAuditLogForBusiness } from "@cofounderai/core/audit/queries";
import { ACTION_LABEL } from "@cofounderai/core/audit/format";
import type { AuditLogEntry } from "@cofounderai/core/audit/types";
import { listBusinessMembers, listBusinessRoles } from "@cofounderai/core/rbac/members";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { cn } from "@cofounderai/core/lib/utils";
import { formatDateTime } from "@cofounderai/core/lib/format";
import { loadAccessContext } from "../access-data";
import { AccessTabs, accessBreadcrumbs, MemberAvatar, NoMembersPermission } from "../access-ui";

/**
 * RBAC-35 (§47) -- who changed access to this business: invitations, role changes,
 * suspensions, removals, custom-role edits and ownership transfers. Read straight from
 * core.audit_log, which the core.* RBAC functions write in the same transaction as the
 * change itself, so this feed can't disagree with what actually happened.
 */

const FILTERS = [
  { key: "", label: "All activity", entityTypes: ["business_member", "business_invitation", "role"] },
  { key: "members", label: "Members", entityTypes: ["business_member"] },
  { key: "invitations", label: "Invitations", entityTypes: ["business_invitation"] },
  { key: "roles", label: "Roles", entityTypes: ["role"] },
] as const;

const RELEVANT = /^(member|role|ownership)\./;

/** Sentence form for this feed ("Kunal changed the role of Priya"); the audit page's own
 * noun labels live in core/audit/format.ts. */
const VERB: Record<string, string> = {
  "member.invited": "invited",
  "member.invitation_accepted": "accepted an invitation",
  "member.invitation_revoked": "revoked the invitation for",
  "member.role_changed": "changed the role of",
  "member.suspended": "suspended",
  "member.reactivated": "reactivated",
  "member.removed": "removed",
  "ownership.transferred": "transferred ownership to",
  "role.created": "created the role",
  "role.updated": "updated the role",
  "role.permissions_changed": "changed the permissions of",
  "role.archived": "archived the role",
};

type Json = Record<string, unknown> | null;
const str = (obj: Json, key: string): string | null => (obj && typeof obj[key] === "string" ? (obj[key] as string) : null);
const list = (obj: Json, key: string): string[] => (obj && Array.isArray(obj[key]) ? (obj[key] as unknown[]).map(String) : []);

/** Server-rendered once per request, so "2 hours ago" is as of this page load. */
function timeAgo(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { businessSlug } = await params;
  const { type = "" } = await searchParams;
  const context = await loadAccessContext(businessSlug);
  const { business, can, businessId } = context;
  const breadcrumbs = accessBreadcrumbs(business.name, businessSlug, [{ label: "Activity" }]);

  if (!can.view) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6">
        <PageHeader title="Users & Access" breadcrumbs={breadcrumbs} />
        <NoMembersPermission />
      </main>
    );
  }

  const filter = FILTERS.find((f) => f.key === type) ?? FILTERS[0];
  const [batches, actors, members, roles] = await Promise.all([
    Promise.all(filter.entityTypes.map((entityType) => listAuditLogForBusiness(businessId, { entityType }))),
    listAuditActors(businessId),
    listBusinessMembers(businessId),
    listBusinessRoles(businessId, { includeArchived: true }),
  ]);
  const entries = batches
    .flat()
    .filter((e) => RELEVANT.test(e.action))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 200);

  const nameByUser = new Map(actors.map((a) => [a.id, a.name]));
  const memberById = new Map(members.map((m) => [m.id, m]));
  const roleName = (id: string | null) => (id ? (roles.find((r) => r.id === id)?.name ?? "a removed role") : "—");
  const userName = (id: string | null) => (id ? (nameByUser.get(id) ?? "Former member") : null);

  function describe(e: AuditLogEntry): { target: string | null; detail: string | null } {
    const before = e.before as Json;
    const after = e.after as Json;
    switch (e.action) {
      case "member.invited":
        return { target: str(after, "email"), detail: `as ${roleName(str(after, "role_id"))}` };
      case "member.invitation_accepted":
        return { target: null, detail: `joined as ${roleName(str(after, "role_id"))}` };
      case "member.invitation_revoked":
        return { target: str(after, "email"), detail: null };
      case "member.role_changed":
        return {
          target: memberName(e.entity_id, str(after, "user_id")),
          detail: `${roleName(str(before, "role_id"))} → ${roleName(str(after, "role_id"))}`,
        };
      case "member.suspended":
      case "member.removed":
      case "member.reactivated": {
        const reason = str(after, "reason");
        return { target: memberName(e.entity_id, str(after, "user_id")), detail: reason ? `Reason: ${reason}` : null };
      }
      case "ownership.transferred":
        return { target: userName(str(after, "owner_user_id")), detail: `from ${userName(str(before, "owner_user_id")) ?? "the previous owner"}` };
      case "role.created":
        return { target: str(after, "name"), detail: `${list(after, "permissions").length} permissions` };
      case "role.permissions_changed": {
        const was = new Set(list(before, "permissions"));
        const is = new Set(list(after, "permissions"));
        const added = [...is].filter((k) => !was.has(k)).length;
        const removed = [...was].filter((k) => !is.has(k)).length;
        return { target: str(after, "name") ?? str(before, "name"), detail: `${added} added, ${removed} removed` };
      }
      case "role.updated": {
        const from = str(before, "name");
        const to = str(after, "name");
        return { target: to ?? from, detail: from && to && from !== to ? `renamed from ${from}` : null };
      }
      case "role.archived":
        return { target: str(after, "name") ?? roleName(e.entity_id), detail: null };
      default:
        return { target: null, detail: null };
    }
  }

  function memberName(memberId: string | null, userId: string | null): string {
    const member = memberId ? memberById.get(memberId) : undefined;
    if (member) return member.name?.trim() || member.email || "a member";
    return userName(userId) ?? "a member";
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6">
      <PageHeader title="Users & Access" description="Who changed access to this business, and when." breadcrumbs={breadcrumbs} />
      <AccessTabs businessSlug={businessSlug} active="activity" />

      <nav aria-label="Filter activity" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `/${businessSlug}/admin/users/activity?type=${f.key}` : `/${businessSlug}/admin/users/activity`}
            aria-current={filter.key === f.key ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter.key === f.key ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {entries.length === 0 ? (
        <EmptyState icon={History} message="No access changes yet." />
      ) : (
        <ol className="flex flex-col divide-y rounded-xl border bg-card">
          {entries.map((e) => {
            const actor = userName(e.actor_id) ?? "System";
            const { target, detail } = describe(e);
            return (
              <li key={e.id} className="flex items-start gap-3 p-4">
                <MemberAvatar name={actor} email={null} className="size-8" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                  <p>
                    <span className="font-medium">{actor}</span>{" "}
                    <span className="text-muted-foreground">{VERB[e.action] ?? ACTION_LABEL[e.action] ?? e.action}</span>
                    {target ? <span className="font-medium"> {target}</span> : null}
                  </p>
                  {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
                </div>
                <time dateTime={e.created_at} title={formatDateTime(e.created_at)} className="shrink-0 text-xs text-muted-foreground">
                  {timeAgo(e.created_at)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
