import { MailPlus } from "lucide-react";
import { listBusinessRoles, listInvitations, listPermissionCatalogue } from "@cofounderai/core/rbac/members";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { buildAccessValue, loadAccessContext } from "../access-data";
import { AccessTabs, accessBreadcrumbs, formatDay, InvitationStatusBadge, NoMembersPermission } from "../access-ui";
import { InviteDialog } from "../invite-dialog";
import { RevokeInvitationButton } from "./revoke-button";

/**
 * RBAC-24 (§16-§18) -- invitations sent for this business and where each one stands.
 * An invitation is not a membership until it's accepted (§17), so it lives here rather
 * than in the users list. Readable with members.view or members.invite (RLS); revoking
 * needs members.invite (core.revoke_invitation).
 */
export default async function InvitationsPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const context = await loadAccessContext(businessSlug);
  const { business, can } = context;
  const breadcrumbs = accessBreadcrumbs(business.name, businessSlug, [{ label: "Invitations" }]);

  if (!can.view && !can.invite) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6">
        <PageHeader title="Users & Access" breadcrumbs={breadcrumbs} />
        <NoMembersPermission />
      </main>
    );
  }

  const [invitations, roles, catalogue] = await Promise.all([
    listInvitations(context.businessId),
    can.invite ? listBusinessRoles(context.businessId) : Promise.resolve([]),
    can.invite ? listPermissionCatalogue() : Promise.resolve([]),
  ]);
  const inviteRoles = can.invite ? buildAccessValue(businessSlug, context, roles, catalogue).roles : [];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6">
      <PageHeader
        title="Users & Access"
        description="Invitations you've sent and where each one stands."
        breadcrumbs={breadcrumbs}
        actions={can.invite ? <InviteDialog businessSlug={businessSlug} businessName={business.name} roles={inviteRoles} /> : null}
      />
      <AccessTabs businessSlug={businessSlug} active="invitations" />

      {invitations.length === 0 ? (
        <EmptyState icon={MailPlus} message="No invitations yet." />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border bg-card sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <div className="font-medium">{inv.email}</div>
                      {inv.invitedName ? <div className="text-xs text-muted-foreground">{inv.invitedName}</div> : null}
                    </TableCell>
                    <TableCell>{inv.roleName}</TableCell>
                    <TableCell>
                      <InvitationStatusBadge status={inv.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDay(inv.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {inv.status === "pending" ? formatDay(inv.expiresAt) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {inv.status === "pending" && can.invite ? (
                        <RevokeInvitationButton businessSlug={businessSlug} invitationId={inv.id} email={inv.email} />
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col gap-3 sm:hidden">
            {invitations.map((inv) => (
              <li key={inv.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">{inv.roleName}</p>
                  </div>
                  <InvitationStatusBadge status={inv.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Sent {formatDay(inv.createdAt)}
                  {inv.status === "pending" ? ` · expires ${formatDay(inv.expiresAt)}` : ""}
                </p>
                {inv.status === "pending" && can.invite ? (
                  <div>
                    <RevokeInvitationButton businessSlug={businessSlug} invitationId={inv.id} email={inv.email} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
