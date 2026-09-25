"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { cn } from "@cofounderai/core/lib/utils";

/** What every Marketing/Funding server action returns. */
export type FormState = { error: string } | { success: true; message?: string } | null;
export type FormAction = (prevState: FormState, formData: FormData) => Promise<FormState>;

/**
 * The one form wrapper the Marketing and Funding screens use: runs a server action
 * through `useActionState`, shows its error inline (never as a toast that disappears
 * before a founder on a phone has read it), and optionally clears itself on success.
 *
 * Two submission paths, on purpose. The form keeps `action={formAction}` so a click that
 * lands before the page has hydrated still posts to the server action (React's
 * progressive enhancement) instead of falling back to a plain GET that reloads the page
 * and saves nothing. Once hydrated, `onSubmit` takes over and dispatches the action itself
 * inside a transition: React resets every uncontrolled field after a `<form action>`
 * completes — even when the server answered with a validation error — so a founder who
 * got one field wrong would otherwise lose everything else they typed. `preventDefault()`
 * stops React's own action dispatch, so it runs exactly once. Fields are cleared only on
 * success, and only with `resetOnSuccess`.
 *
 * Kept free of field knowledge so a Server Component page can pass plain inputs as
 * children and a server action bound to the business id.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingText,
  resetOnSuccess = false,
  successMessage,
  variant,
  size,
  inline = false,
  className,
  confirm,
  encType,
}: {
  action: FormAction;
  children?: ReactNode;
  submitLabel: string;
  pendingText?: string;
  resetOnSuccess?: boolean;
  successMessage?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  size?: "default" | "sm" | "lg";
  /** A one-button form rendered in a row of actions. */
  inline?: boolean;
  className?: string;
  /** A question the browser asks before submitting — for deletes and publishes. */
  confirm?: string;
  encType?: "multipart/form-data";
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state && "success" in state) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  const error = state && "error" in state ? state.error : null;
  const success = state && "success" in state ? (state.message ?? successMessage ?? null) : null;

  return (
    <form
      ref={formRef}
      action={formAction}
      encType={encType}
      className={cn(inline ? "inline-flex flex-col gap-1" : "flex flex-col gap-4", className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        if (confirm && !window.confirm(confirm)) return;
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(data));
      }}
    >
      {children}
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm break-words whitespace-pre-line text-destructive">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="text-sm break-words whitespace-pre-line text-success-subtle">
          {success}
        </p>
      ) : null}
      <div className={inline ? "" : "flex justify-end"}>
        <Button type="submit" variant={variant} size={size ?? (inline ? "sm" : "default")} disabled={pending} aria-busy={pending}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {pendingText ?? "Working..."}
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </form>
  );
}
