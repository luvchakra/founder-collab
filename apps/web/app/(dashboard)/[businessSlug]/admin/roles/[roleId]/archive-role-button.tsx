"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@cofounderai/core/ui/alert-dialog";
import { archiveRoleAction } from "../actions";

/** RBAC-29 (§15) -- archiving is refused while anyone still holds the role; the server's
 * "Reassign N users before archiving this role." is shown as-is. */
export function ArchiveRoleButton({ businessSlug, roleId, roleName }: { businessSlug: string; roleId: string; roleName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setError(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:text-destructive">
          <Archive aria-hidden="true" /> Archive role
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {roleName}?</AlertDialogTitle>
          <AlertDialogDescription>
            It can no longer be assigned, and any pending invitations for it are revoked. Its history is kept.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const result = await archiveRoleAction(businessSlug, roleId);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                router.push(`/${businessSlug}/admin/roles`);
                router.refresh();
              })
            }
          >
            {pending ? "Archiving…" : "Archive role"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
