"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { revokeInvitationAction } from "../actions";

/** RBAC-24 -- revoking a pending invitation makes its emailed link stop working. */
export function RevokeInvitationButton({ businessSlug, invitationId, email }: { businessSlug: string; invitationId: string; email: string }) {
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
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
          Revoke
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke the invitation for {email}?</AlertDialogTitle>
          <AlertDialogDescription>The link in their email will stop working. You can invite them again later.</AlertDialogDescription>
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
                const result = await revokeInvitationAction(businessSlug, invitationId);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setOpen(false);
                router.refresh();
              })
            }
          >
            {pending ? "Revoking…" : "Revoke invitation"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
