"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@cofounderai/core/ui/button";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** A form that reports the server's own words. `confirm` asks twice; callers key it by status
 * so a confirm never outlives the change it asked about. */
export function OwnerForm({
  action,
  submitLabel,
  confirm,
  variant = "default",
  children,
  className,
}: {
  action: (formData: FormData) => Promise<Result>;
  submitLabel: string;
  confirm?: string;
  variant?: "default" | "outline" | "destructive";
  children?: ReactNode;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  return (
    <form
      className={className ?? "flex flex-col gap-2"}
      action={(formData) => {
        if (confirm && !confirming) {
          setConfirming(true);
          return;
        }
        setError(null);
        start(async () => {
          const result = await action(formData);
          setConfirming(false);
          if (!result.ok) setError(result.error);
          else toast.success(result.message ?? "Done.");
        });
      }}
    >
      {children}
      {confirming ? <p className="text-xs text-muted-foreground">{confirm}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant={variant} disabled={pending}>
          {pending ? "Working…" : confirming ? `Yes, ${submitLabel.toLowerCase()}` : submitLabel}
        </Button>
        {confirming ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
