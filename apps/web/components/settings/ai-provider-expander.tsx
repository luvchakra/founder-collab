"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@cofounderai/core/lib/utils";
import { AiProviderForm } from "./ai-provider-form";

/**
 * Collapses AiProviderForm's provider-picker + key form behind a single-row toggle,
 * closed by default -- the Billing page used to show it permanently expanded under a
 * static "Replace key" heading, but with a dedicated Disconnect button now living right
 * next to the connected-provider row (billing/page.tsx), this form is only needed when a
 * founder actually wants to switch providers, not on every page load. Same collapse
 * pattern as BusinessLicensesExpander (settings/page.tsx's inline Licenses panel).
 */
export function AiProviderExpander(props: React.ComponentProps<typeof AiProviderForm>) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
      >
        AI Provider
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open ? <AiProviderForm {...props} /> : null}
    </div>
  );
}
