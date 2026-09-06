"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@cofounderai/core/lib/utils";

/** "Prefer a unified authentication page with a toggle/tab: Log In | Sign Up"
 * (landing-page-requirements.md #24) -- kept as two routes (each has its own headline
 * and copy per the doc's sections 25/26) but visually presented as one toggle. */
export function AuthTabs() {
  const pathname = usePathname();
  const isSignup = pathname === "/signup";

  return (
    <div className="inline-flex rounded-full border border-landing-surface-border bg-landing-surface p-1 text-sm">
      <Link
        href="/login"
        className={cn(
          "rounded-full px-4 py-1.5 font-medium transition-colors",
          !isSignup ? "bg-landing-accent text-landing-accent-foreground" : "text-landing-muted hover:text-landing-fg",
        )}
      >
        Log In
      </Link>
      <Link
        href="/signup"
        className={cn(
          "rounded-full px-4 py-1.5 font-medium transition-colors",
          isSignup ? "bg-landing-accent text-landing-accent-foreground" : "text-landing-muted hover:text-landing-fg",
        )}
      >
        Sign Up
      </Link>
    </div>
  );
}
