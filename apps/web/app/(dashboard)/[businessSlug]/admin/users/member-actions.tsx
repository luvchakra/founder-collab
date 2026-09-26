"use client";
// RBAC-16 -- changing a role shows the permissions added and removed (role comparison) before confirming.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crown, Lock, MoreHorizontal, ShieldCheck, UserCheck, UserMinus, UserX, Eye } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@cofounderai/core/ui/radio-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@cofounderai/core/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@cofounderai/core/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@cofounderai/core/ui/alert-dialog";
import { cn } from "@cofounderai/core/lib/utils";
import { useAccess } from "./access-context";
import { changeMemberRoleAction, setMemberStatusAction, transferOwnershipAction } from "./actions";

export type MemberForActions = {
  id: string;
  name: string | null;
  email: string | null;
  roleId: string;
  roleKey: string;
  roleName: string;
  status: string;
  isMe: boolean;
};

type DialogKind = "role" | "suspend" | "reactivate" | "remove" | "transfer";

/** Which actions this viewer may take on this member (the server re-checks every one). */
export function memberActionsFor(member: MemberForActions, can: ReturnType<typeof useAccess>["can"]) {
  const other = !member.isMe;
  const owner = member.roleKey === "owner";
  return {
    role: can.assign && other && !owner,
    suspend: can.suspend && other && !owner && member.status === "active",
    reactivate: can.suspend && other && member.status === "suspended",
    remove: can.remove && other && !owner,
    transfer: can.transfer && other && !owner && member.status === "active",
  };
}

/**
 * RBAC-22/23 -- the per-member actions: a "•••" menu in the users list, a row of buttons
 * on the user's own page. Each opens a confirmation; errors from the server (last owner,
 * privilege ceiling, ...) stay inline in the dialog.
 */
export function MemberActions({ member, variant = "menu" }: { member: MemberForActions; variant?: "menu" | "buttons" }) {
  const { businessSlug, can } = useAccess();
  const [open, setOpen] = useState<DialogKind | null>(null);
  const allowed = memberActionsFor(member, can);
  const name = member.name?.trim() || member.email || "this member";
  const anyAction = Object.values(allowed).some(Boolean);

  const dialogs = (
    <>
      {allowed.role ? <ChangeRoleDialog member={member} name={name} open={open === "role"} onOpenChange={(v) => setOpen(v ? "role" : null)} /> : null}
      {allowed.suspend || allowed.reactivate ? (
        <StatusDialog
          member={member}
          name={name}
          kind={allowed.suspend ? "suspend" : "reactivate"}
          open={open === "suspend" || open === "reactivate"}
          onOpenChange={(v) => setOpen(v ? (allowed.suspend ? "suspend" : "reactivate") : null)}
        />
      ) : null}
      {allowed.remove ? <RemoveDialog member={member} name={name} open={open === "remove"} onOpenChange={(v) => setOpen(v ? "remove" : null)} /> : null}
      {allowed.transfer ? <TransferDialog member={member} name={name} open={open === "transfer"} onOpenChange={(v) => setOpen(v ? "transfer" : null)} /> : null}
    </>
  );

  if (variant === "buttons") {
    if (!anyAction) return null;
    return (
      <div className="flex flex-wrap gap-2">
        {allowed.role ? (
          <Button variant="outline" onClick={() => setOpen("role")}>
            <ShieldCheck aria-hidden="true" /> Change role
          </Button>
        ) : null}
        {allowed.suspend ? (
          <Button variant="outline" onClick={() => setOpen("suspend")}>
            <UserMinus aria-hidden="true" /> Suspend
          </Button>
        ) : null}
        {allowed.reactivate ? (
          <Button variant="outline" onClick={() => setOpen("reactivate")}>
            <UserCheck aria-hidden="true" /> Reactivate
          </Button>
        ) : null}
        {allowed.transfer ? (
          <Button variant="outline" onClick={() => setOpen("transfer")}>
            <Crown aria-hidden="true" /> Transfer ownership
          </Button>
        ) : null}
        {allowed.remove ? (
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setOpen("remove")}>
            <UserX aria-hidden="true" /> Remove access
          </Button>
        ) : null}
        {dialogs}
      </div>
    );
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${name}`}>
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem asChild>
            <Link href={`/${businessSlug}/admin/users/${member.id}`}>
              <Eye className="size-4" aria-hidden="true" /> View details
            </Link>
          </DropdownMenuItem>
          {allowed.role ? (
            <DropdownMenuItem onSelect={() => setOpen("role")}>
              <ShieldCheck className="size-4" aria-hidden="true" /> Change role
            </DropdownMenuItem>
          ) : null}
          {allowed.suspend ? (
            <DropdownMenuItem onSelect={() => setOpen("suspend")}>
              <UserMinus className="size-4" aria-hidden="true" /> Suspend
            </DropdownMenuItem>
          ) : null}
          {allowed.reactivate ? (
            <DropdownMenuItem onSelect={() => setOpen("reactivate")}>
              <UserCheck className="size-4" aria-hidden="true" /> Reactivate
            </DropdownMenuItem>
          ) : null}
          {allowed.transfer ? (
            <DropdownMenuItem onSelect={() => setOpen("transfer")}>
              <Crown className="size-4" aria-hidden="true" /> Transfer ownership
            </DropdownMenuItem>
          ) : null}
          {allowed.remove ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setOpen("remove")}>
                <UserX className="size-4" aria-hidden="true" /> Remove
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogs}
    </>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null;
}

type DialogProps = { member: MemberForActions; name: string; open: boolean; onOpenChange: (open: boolean) => void };

/** Runs one action; on success closes the dialog and refreshes the server-rendered page. */
function useRunner(onOpenChange: (open: boolean) => void, after?: () => void) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }
      onOpenChange(false);
      if (after) after();
      else router.refresh();
    });
  return { pending, error, setError, run };
}

/** §24 -- choose the new role and see exactly which permissions are added and removed. */
function ChangeRoleDialog({ member, name, open, onOpenChange }: DialogProps) {
  const { businessSlug, roles, permissionLabel } = useAccess();
  const [roleId, setRoleId] = useState(member.roleId);
  const { pending, error, setError, run } = useRunner(onOpenChange);
  const options = roles.filter((r) => r.key !== "owner");
  const current = roles.find((r) => r.id === member.roleId);
  const next = roles.find((r) => r.id === roleId);
  const before = new Set(current?.permissionKeys ?? []);
  const after = new Set(next?.permissionKeys ?? []);
  const added = [...after].filter((k) => !before.has(k));
  const removed = [...before].filter((k) => !after.has(k));

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setRoleId(member.roleId);
          setError(null);
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>
            {name} is currently <span className="font-medium text-foreground">{member.roleName}</span>.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={roleId} onValueChange={setRoleId} aria-label="New role" className="gap-1.5">
          {options.map((r) => (
            <label
              key={r.id}
              htmlFor={`role-${member.id}-${r.id}`}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-sm",
                r.assignable ? "cursor-pointer hover:bg-accent/40" : "cursor-not-allowed opacity-60",
                roleId === r.id && "border-primary bg-primary/5",
              )}
            >
              <RadioGroupItem id={`role-${member.id}-${r.id}`} value={r.id} disabled={!r.assignable} className="mt-0.5" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">
                  {r.name}
                  {r.id === member.roleId ? <span className="ml-2 text-xs font-normal text-muted-foreground">Current</span> : null}
                </span>
                {r.description ? <span className="text-xs text-muted-foreground">{r.description}</span> : null}
                {!r.assignable ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="size-3" aria-hidden="true" /> Includes permissions you don&apos;t have
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </RadioGroup>
        {roleId !== member.roleId ? (
          <div className="grid gap-3 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-2">
            <PermissionDiff title={`Adds ${added.length}`} keys={added} labels={permissionLabel} tone="add" />
            <PermissionDiff title={`Removes ${removed.length}`} keys={removed} labels={permissionLabel} tone="remove" />
          </div>
        ) : null}
        <Link href={`/${businessSlug}/admin/roles/${roleId}`} className="text-sm text-primary hover:underline">
          View role permissions
        </Link>
        <ErrorLine error={error} />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button disabled={pending || roleId === member.roleId} onClick={() => run(() => changeMemberRoleAction(businessSlug, member.id, roleId))}>
            {pending ? "Saving…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PermissionDiff({ title, keys, labels, tone }: { title: string; keys: string[]; labels: Record<string, string>; tone: "add" | "remove" }) {
  return (
    <div>
      <p className={cn("text-xs font-semibold uppercase tracking-wide", tone === "add" ? "text-success-subtle" : "text-destructive-subtle")}>
        {title} {keys.length === 1 ? "permission" : "permissions"}
      </p>
      {keys.length > 0 ? (
        <ul className="mt-1 flex max-h-32 flex-col gap-0.5 overflow-y-auto text-xs text-muted-foreground">
          {keys.map((k) => (
            <li key={k}>
              {tone === "add" ? "+ " : "− "}
              {labels[k] ?? k}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** §45 -- suspension keeps the membership and role but denies access; reactivation restores both. */
function StatusDialog({ member, name, kind, open, onOpenChange }: DialogProps & { kind: "suspend" | "reactivate" }) {
  const { businessSlug } = useAccess();
  const [reason, setReason] = useState("");
  const { pending, error, setError, run } = useRunner(onOpenChange);
  const suspend = kind === "suspend";
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setReason("");
          setError(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{suspend ? `Suspend ${name}?` : `Reactivate ${name}?`}</DialogTitle>
          <DialogDescription>
            {suspend
              ? "They keep their role, but can't open this business until you reactivate them. Nothing they created is removed."
              : `They get their ${member.roleName} access back straight away.`}
          </DialogDescription>
        </DialogHeader>
        {suspend ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`suspend-reason-${member.id}`}>Reason (optional)</Label>
            <Textarea id={`suspend-reason-${member.id}`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </div>
        ) : null}
        <ErrorLine error={error} />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant={suspend ? "destructive" : "default"}
            disabled={pending}
            onClick={() => run(() => setMemberStatusAction(businessSlug, member.id, suspend ? "suspended" : "active", suspend ? reason : null))}
          >
            {pending ? "Saving…" : suspend ? "Suspend" : "Reactivate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveDialog({ member, name, open, onOpenChange }: DialogProps) {
  const { businessSlug } = useAccess();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const { pending, error, setError, run } = useRunner(onOpenChange, () => {
    router.push(`/${businessSlug}/admin/users`);
    router.refresh();
  });
  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setReason("");
          setError(null);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {name} from this business?</AlertDialogTitle>
          <AlertDialogDescription>
            They lose access to this business immediately. Their account, their other businesses and the history of what they did here are kept.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`remove-reason-${member.id}`}>Reason (optional)</Label>
          <Textarea id={`remove-reason-${member.id}`} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </div>
        <ErrorLine error={error} />
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={() => run(() => setMemberStatusAction(businessSlug, member.id, "removed", reason))}>
            {pending ? "Removing…" : "Remove access"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** §44 -- ownership moves only through this explicit step; the old owner becomes an Admin. */
function TransferDialog({ member, name, open, onOpenChange }: DialogProps) {
  const { businessSlug } = useAccess();
  const [confirmed, setConfirmed] = useState(false);
  const { pending, error, setError, run } = useRunner(onOpenChange);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setConfirmed(false);
          setError(null);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Transfer ownership to {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {name} becomes the Owner of this business, with full control including billing and members. You become an Admin. Only the new owner
            can transfer it back.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label htmlFor={`transfer-confirm-${member.id}`} className="flex items-start gap-2 text-sm">
          <Checkbox id={`transfer-confirm-${member.id}`} checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
          <span>I understand I&apos;ll no longer be the owner of this business.</span>
        </label>
        <ErrorLine error={error} />
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button disabled={pending || !confirmed} onClick={() => run(() => transferOwnershipAction(businessSlug, member.id))}>
            {pending ? "Transferring…" : "Transfer ownership"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
