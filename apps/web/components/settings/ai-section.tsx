"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Sparkles, X } from "lucide-react";
import { cn } from "@cofounderai/core/lib/utils";
import { BRAND_NAME } from "@cofounderai/core/lib/brand";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { AI_PROVIDER_LABELS, type AiProviderConnection } from "@cofounderai/module-discovery/lib/ai-providers/types";
import { AiProviderForm } from "./ai-provider-form";
import type { ConnectProviderActionState } from "@/app/(dashboard)/dashboard/settings/billing/actions";

/**
 * The whole "AI" card collapses behind one summary row -- closed by default, so the
 * Billing page reads as a compact list rather than a permanently-expanded block of
 * connection details and a provider-switch form most visits never touch. Replaces the
 * page's old always-visible "AI" heading + description + connection card (now folded in
 * here) and the previous AiProviderExpander's own separate inner collapse, which was
 * redundant once the whole section itself collapses.
 */
export function AiSection({
  connection,
  connectAction,
  disconnectAction,
  freeTierRunLimit,
  freeTierCostLimitUsd,
}: {
  connection: AiProviderConnection | null;
  connectAction: (
    prevState: ConnectProviderActionState,
    formData: FormData,
  ) => Promise<ConnectProviderActionState>;
  disconnectAction: () => Promise<void>;
  /** Passed in as plain numbers rather than imported from usage/limits.ts directly --
   * that module also exports assertWithinUsageLimit(), which pulls in server-only code
   * (packages/core/src/db/server.ts's "next/headers") through tenancy/queries.ts. This
   * is a Client Component, so importing it here would bundle that whole chain into the
   * client build and fail it (Turbopack: "next/headers" used outside a Server Component)
   * -- the numbers themselves are perfectly safe to serialize as props. */
  freeTierRunLimit: number;
  freeTierCostLimitUsd: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex max-w-lg flex-col rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-accent/40"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <Sparkles className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-medium">AI</p>
            <p className="truncate text-xs text-muted-foreground">
              {connection
                ? `${AI_PROVIDER_LABELS[connection.provider]} -- ${
                    connection.status === "connected" ? "Connected" : "Connection error"
                  }`
                : "Using included credits"}
            </p>
          </div>
        </div>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="flex flex-col gap-4 border-t p-4">
          <p className="text-sm text-muted-foreground">
            {connection
              ? "AI features run on your own connected provider account and your own API key -- your usage bills directly to your provider, with no monthly cap from us."
              : `AI features currently run on ${BRAND_NAME}'s included credits, capped at a modest free-tier allowance each month. Connect your own provider key any time to bypass that cap.`}
          </p>

          {connection ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{AI_PROVIDER_LABELS[connection.provider]}</p>
                  <p className="text-sm text-muted-foreground">••••••••••••{connection.keyFingerprint}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {connection.status === "connected" ? (
                    <span className="text-sm text-emerald-600">✓ Connected</span>
                  ) : (
                    <span className="text-sm text-destructive">Connection error</span>
                  )}
                  <form action={disconnectAction}>
                    <SubmitButton
                      variant="outline"
                      size="icon"
                      pendingText=""
                      aria-label="Disconnect"
                      title="Disconnect"
                      className="size-7 rounded-full p-0"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </SubmitButton>
                  </form>
                </div>
              </div>
              {connection.lastError ? <p className="text-sm text-destructive">{connection.lastError}</p> : null}

              <div className="border-t pt-4">
                <p className="mb-3 text-sm font-medium">Switch provider</p>
                <AiProviderForm
                  action={connectAction}
                  disconnectAction={disconnectAction}
                  defaultProvider={connection.provider}
                  submitLabel="Replace key"
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
                  Using {BRAND_NAME}&apos;s included credits
                </p>
                <p className="text-xs text-muted-foreground">
                  No key connected -- AI features run on our free tier, up to{" "}
                  {freeTierRunLimit} AI runs (${freeTierCostLimitUsd} of spend)
                  per workspace per month.
                </p>
                <Link href="/dashboard/settings/usage" className="self-start text-xs font-medium text-primary hover:underline">
                  View your current usage →
                </Link>
              </div>

              <div>
                <p className="mb-3 text-sm font-medium">Bring your own key (optional)</p>
                <AiProviderForm action={connectAction} disconnectAction={disconnectAction} submitLabel="Connect" />
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
