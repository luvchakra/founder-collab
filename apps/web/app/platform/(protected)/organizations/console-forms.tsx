"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@cofounderai/core/ui/button";

type Result = { ok: true; message?: string } | { ok: false; error: string };

/**
 * A console form that reports what actually happened: the server's own message on success
 * (which can be partial, e.g. "2 of 3 environments changed"), the refusal in words on failure.
 * `confirm` adds a second click; callers key the component by status so a finished confirm
 * never survives a re-render (WonderID pitfall).
 */
export function ConsoleForm({
  action,
  submitLabel,
  confirm,
  destructive,
  children,
  className,
}: {
  action: (formData: FormData) => Promise<Result>;
  submitLabel: string;
  confirm?: string;
  destructive?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function submit(formData: FormData) {
    if (confirm && !confirming) {
      setConfirming(true);
      return;
    }
    setError(null);
    start(async () => {
      const result = await action(formData);
      setConfirming(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(result.message ?? "Saved.");
    });
  }

  return (
    <form action={submit} className={className ?? "flex flex-col gap-2"}>
      {children}
      {confirming ? <p className="text-xs text-amber-300">{confirm}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant={destructive ? "destructive" : "default"} disabled={pending}>
          {pending ? "Working…" : confirming ? `Yes, ${submitLabel.toLowerCase()}` : submitLabel}
        </Button>
        {confirming ? (
          <Button type="button" size="sm" variant="ghost" className="text-zinc-300 hover:bg-zinc-800" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}
