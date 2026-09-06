"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { landingButtonVariants } from "./landing-button";
import { submitInterestAction, type ShowInterestState } from "@cofounderai/module-discovery/actions/interest";
import { cn } from "@cofounderai/core/lib/utils";

/** Low-emphasis trigger so "Show Interest" never competes with the page's one primary
 * action (design principle 4, docs/landing-page-requirements.md) -- it's for a visitor who
 * isn't ready for "Start Free" yet, not a second Start Free. */
export function ShowInterestCta({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(landingButtonVariants({ variant: "ghost" }), "underline-offset-4 hover:underline", className)}
      >
        Show Interest
      </button>
      {open ? <ShowInterestModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ShowInterestModal({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState<ShowInterestState, FormData>(
    submitInterestAction,
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    inputRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const success = state !== null && "success" in state;
  const error = state !== null && "error" in state ? state.error : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8">
      <div
        className={cn(
          "absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-200",
          mounted ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="show-interest-title"
        className={cn(
          "landing-glow relative w-full max-w-md rounded-2xl border border-landing-surface-border bg-landing-bg-elevated p-8 shadow-2xl transition-all duration-200",
          mounted ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-95 opacity-0",
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-landing-muted transition-colors hover:text-landing-fg"
        >
          <X className="size-5" aria-hidden="true" />
        </button>

        {success ? (
          <div className="text-center">
            <h2 id="show-interest-title" className="text-xl font-semibold text-landing-fg">
              You&apos;re on the list! 🎉
            </h2>
            <p className="mt-2 text-sm text-landing-muted">We&apos;ll be in touch soon.</p>
            <button
              type="button"
              onClick={onClose}
              className={cn(landingButtonVariants({ variant: "secondary" }), "mt-6 w-full")}
            >
              Close
            </button>
          </div>
        ) : (
          <form action={formAction}>
            <h2 id="show-interest-title" className="text-xl font-semibold text-landing-fg">
              Interested in CoFounderAI?
            </h2>
            <p className="mt-2 text-sm text-landing-muted">
              Leave your email and we&apos;ll let you know when we&apos;re ready for you.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <label htmlFor="show-interest-email" className="sr-only">
                Email
              </label>
              <input
                ref={inputRef}
                id="show-interest-email"
                name="email"
                type="email"
                required
                placeholder="you@company.com"
                aria-invalid={error ? true : undefined}
                className="w-full rounded-lg border border-landing-surface-border bg-landing-surface px-4 py-2.5 text-sm text-landing-fg placeholder:text-landing-muted focus-visible:ring-2 focus-visible:ring-landing-accent focus-visible:outline-none"
              />
              {error ? (
                <p role="alert" className="text-sm text-red-400">
                  {error}
                </p>
              ) : null}
            </div>
            <button
              type="submit"
              disabled={pending}
              className={cn(landingButtonVariants({ variant: "primary", size: "lg" }), "mt-6 w-full")}
            >
              {pending ? "Submitting…" : "Notify Me"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
