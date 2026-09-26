"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@cofounderai/core/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@cofounderai/core/ui/dialog";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { Textarea } from "@cofounderai/core/ui/textarea";

export type ReasonActionResult = { ok: true } | { ok: false; error: string };

const DIALOG_CLASS = "border-zinc-800 bg-zinc-900 text-zinc-50";
const FIELD_CLASS = "border-zinc-700 bg-zinc-950/60 text-zinc-50 placeholder:text-zinc-500";

/**
 * A confirm-with-a-reason dialog for single-click platform mutations -- first used by
 * PLATFORM-P0-10.4's AI feature kill switch. PLATFORM-P0-18.4's rule for a global change -- explicit
 * confirmation, a reason, audit, and a typed confirmation for critical operations -- in one
 * place: `confirmText` adds the typed step, the reason is always required, and the server
 * action it calls is what writes the audit row. The action is a server action bound in the
 * server component (`action.bind(null, id)`), so the reason is the only thing the browser
 * contributes.
 */
export function ReasonActionDialog({
  trigger,
  title,
  description,
  confirmLabel,
  confirmText,
  destructive = false,
  successMessage,
  action,
  children,
}: {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** When set, the superadmin must type this exact text before confirming. */
  confirmText?: string;
  destructive?: boolean;
  successMessage: string;
  action: (reason: string) => Promise<ReasonActionResult>;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    setReason("");
    setTyped("");
    setError(null);
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await action(reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(successMessage);
      onOpenChange(false);
    });
  }

  const ready = reason.trim().length > 0 && (!confirmText || typed === confirmText);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={`${DIALOG_CLASS} max-w-md`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-zinc-400">{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {children}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason-action-reason" className="text-zinc-300">
              Reason (required)
            </Label>
            <Textarea
              id="reason-action-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={FIELD_CLASS}
              rows={2}
              maxLength={500}
            />
          </div>
          {confirmText ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reason-action-typed" className="text-zinc-300">
                Type <span className="font-mono text-zinc-100">{confirmText}</span> to confirm
              </Label>
              <Input id="reason-action-typed" value={typed} onChange={(e) => setTyped(e.target.value)} className={FIELD_CLASS} autoComplete="off" />
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant={destructive ? "destructive" : "default"} onClick={confirm} disabled={pending || !ready}>
            {pending ? "Saving…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
