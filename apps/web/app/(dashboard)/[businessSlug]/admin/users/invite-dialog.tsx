"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Plus } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@cofounderai/core/ui/dialog";
import { ModuleAccessList } from "./access-ui";
import type { RoleOption } from "./access-context";
import { inviteMemberAction } from "./actions";

/**
 * RBAC-21 / §16 -- "Invite user": email, optional name, a role (never Owner -- ownership
 * moves only by transfer), an optional message. The invitation link is emailed once and
 * never shown here: only its hash is stored (§18), so there is nothing to copy.
 */
export function InviteDialog({ businessSlug, businessName, roles }: { businessSlug: string; businessName: string; roles: RoleOption[] }) {
  const router = useRouter();
  const options = roles.filter((r) => r.key !== "owner");
  const firstAssignable = options.find((r) => r.assignable)?.id ?? "";
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState(firstAssignable);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ email: string; emailed: boolean } | null>(null);
  const [pending, start] = useTransition();
  const role = options.find((r) => r.id === roleId);

  function reset() {
    setEmail("");
    setName("");
    setRoleId(firstAssignable);
    setMessage("");
    setError(null);
    setSent(null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    start(async () => {
      setError(null);
      const result = await inviteMemberAction(businessSlug, { email, name, roleId, message });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent({ email: email.trim(), emailed: result.value?.emailed ?? false });
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" /> Invite user
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
          <DialogDescription>Invite someone to join {businessName}.</DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col gap-4">
            <div role="status" className="flex gap-3 rounded-lg border border-success/30 bg-success/10 p-4 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-subtle" aria-hidden="true" />
              {sent.emailed ? (
                <p>
                  <span className="font-medium">Invitation sent</span> to {sent.email}. The link works once and expires in 7 days.
                </p>
              ) : (
                <p>
                  <span className="font-medium">Invitation created</span> for {sent.email}. Email isn&apos;t configured on this deployment, so the
                  invitation email wasn&apos;t sent.
                </p>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={reset}>
                Invite another
              </Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-email">Email address</Label>
              <Input id="invite-email" type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-name">
                Name <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="invite-name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <NativeSelect id="invite-role" required value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                <option value="" disabled>
                  Choose a role
                </option>
                {options.map((r) => (
                  <option key={r.id} value={r.id} disabled={!r.assignable}>
                    {r.name}
                    {r.assignable ? "" : " — includes permissions you don't have"}
                  </option>
                ))}
              </NativeSelect>
              {role?.description ? <p className="text-xs text-muted-foreground">{role.description}</p> : null}
              {role ? (
                <Link href={`/${businessSlug}/admin/roles/${role.id}`} className="text-xs text-primary hover:underline" target="_blank">
                  View role permissions
                </Link>
              ) : null}
            </div>
            {role ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Module access</p>
                <p className="-mt-1 text-xs text-muted-foreground">What this role can open. Change it by choosing a different role.</p>
                <ModuleAccessList role={role} />
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-message">
                Message <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Textarea id="invite-message" maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !roleId}>
                {pending ? "Sending…" : "Send invitation"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
