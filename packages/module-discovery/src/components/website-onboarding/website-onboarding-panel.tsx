"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Badge } from "@cofounderai/core/ui/badge";
import { toast } from "@cofounderai/core/ui/sonner";
import type { WebsiteBusinessProfile, WebsiteFieldStatus } from "../../lib/ai/schemas";
import type { WebsiteOnboardingRun, WebsiteOnboardingStatus } from "../../lib/website-onboarding/types";
import { WEBSITE_FIELD_STATUS_LABEL, WEBSITE_LIST_FIELDS, WEBSITE_TEXT_FIELDS } from "./field-labels";

type RetryResult = { error: string } | { success: true; run: WebsiteOnboardingRun };
type ApplyResult = { error: string } | { success: true };

type StreamEvent =
  | { type: "progress"; profile: Record<string, unknown> }
  | { type: "done"; profile: WebsiteBusinessProfile }
  | { type: "error"; error: string }
  | { type: "noop"; status: WebsiteOnboardingStatus };

/**
 * DISC-OFFER-P0-09.1's own "Website inspection runs asynchronously. Progress is
 * visible. Errors are recoverable." -- drives the streaming website-onboarding route
 * handler exactly the way AutoPopulateProductsButton already drives discover-products/
 * route.ts, but as a standing panel on the Business page rather than a one-off button:
 * a `pending` run left behind by createBusinessFromWebsiteAction starts itself the
 * moment this mounts, with no extra click required, and the result (or a failure) stays
 * on the page rather than disappearing once the request ends.
 *
 * Deliberately does not auto-retry a `running` run found already in that state on mount
 * (as opposed to one this component itself just started) -- that would mean an
 * interrupted request (a crashed tab, a serverless timeout) silently double-bills the
 * AI call on every reload. Instead it offers a plain "Retry" the founder chooses
 * themselves, which starts a brand-new run.
 */
export function WebsiteOnboardingPanel({
  businessId,
  initialRun,
  retryAction,
  applyAction,
}: {
  businessId: string;
  initialRun: WebsiteOnboardingRun;
  retryAction: () => Promise<RetryResult>;
  applyAction: () => Promise<ApplyResult>;
}) {
  const router = useRouter();
  const [run, setRun] = useState(initialRun);
  const [streaming, setStreaming] = useState(false);
  const [progressFieldCount, setProgressFieldCount] = useState(0);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const startedRunIds = useRef(new Set<string>());

  async function startRun(runId: string) {
    if (startedRunIds.current.has(runId)) return;
    startedRunIds.current.add(runId);
    setStreaming(true);
    setProgressFieldCount(0);

    try {
      const response = await fetch(`/dashboard/businesses/${businessId}/website-onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const reader = response.body?.getReader();
      if (!reader) throw new Error("This browser can't stream the response.");

      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === "progress") {
            setProgressFieldCount(Object.keys(event.profile).length);
          } else if (event.type === "done") {
            setRun((r) => ({ ...r, status: "succeeded", profile: event.profile, error: null }));
          } else if (event.type === "error") {
            setRun((r) => ({ ...r, status: "failed", error: event.error }));
          } else if (event.type === "noop") {
            setRun((r) => ({ ...r, status: event.status }));
          }
        }
      }
    } catch (error) {
      setRun((r) => ({ ...r, status: "failed", error: error instanceof Error ? error.message : "Something went wrong." }));
    } finally {
      setStreaming(false);
    }
  }

  useEffect(() => {
    if (run.status === "pending") {
      void startRun(run.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id, run.status]);

  async function handleRetry() {
    const result = await retryAction();
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setApplied(false);
    setRun(result.run);
  }

  async function handleApply() {
    setApplying(true);
    const result = await applyAction();
    setApplying(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setApplied(true);
    router.refresh();
    toast.success("Applied to this business.");
  }

  if (run.status === "pending" || (run.status === "running" && streaming)) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
        <span>
          Reading {run.website} and building your business profile...
          {progressFieldCount > 0 ? ` (${progressFieldCount} of ${WEBSITE_TEXT_FIELDS.length + WEBSITE_LIST_FIELDS.length} fields so far)` : ""}
        </span>
      </div>
    );
  }

  if (run.status === "running") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm">
        <span className="text-muted-foreground">
          Still working on {run.website}{"…"} this can take a moment. If it seems stuck, start over below.
        </span>
        <Button type="button" variant="outline" size="sm" onClick={handleRetry}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  if (run.status === "failed") {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <div>
          <p className="font-medium text-destructive">We couldn&apos;t finish understanding your website.</p>
          <p className="mt-1 text-muted-foreground">{run.error ?? "Something went wrong."}</p>
        </div>
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={handleRetry}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  if (run.status === "succeeded" && run.profile) {
    const profile = run.profile;
    const nameKnown = profile.business_name.status !== "unknown" && !!profile.business_name.value;
    const descriptionKnown = profile.description.status !== "unknown" && !!profile.description.value;

    return (
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Here&apos;s what we found on {run.website}</p>
            <p className="text-xs text-muted-foreground">
              Every item below is either stated on the site, an AI interpretation, or marked as not
              found -- nothing here was invented.
            </p>
          </div>
          {(nameKnown || descriptionKnown) && !applied ? (
            <Button type="button" size="sm" disabled={applying} onClick={handleApply}>
              <Sparkles className="size-3.5" aria-hidden="true" />
              {applying ? "Applying..." : "Apply name & description"}
            </Button>
          ) : applied ? (
            <Badge variant="secondary">Applied</Badge>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {WEBSITE_TEXT_FIELDS.map(({ key, label }) => (
            <FieldCard key={key} label={label} status={profile[key].status}>
              {profile[key].value ?? <span className="text-muted-foreground">Not found on the site.</span>}
            </FieldCard>
          ))}
          {WEBSITE_LIST_FIELDS.map(({ key, label }) => (
            <FieldCard key={key} label={label} status={profile[key].status}>
              {profile[key].items.length > 0 ? (
                <ul className="list-inside list-disc space-y-0.5">
                  {profile[key].items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground">Not found on the site.</span>
              )}
            </FieldCard>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

function FieldCard({
  label,
  status,
  children,
}: {
  label: string;
  status: WebsiteFieldStatus;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border/60 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        {status !== "unknown" ? (
          <Badge variant={status === "explicit" ? "secondary" : "outline"} className="shrink-0">
            {WEBSITE_FIELD_STATUS_LABEL[status]}
          </Badge>
        ) : null}
      </div>
      <div className="text-muted-foreground [&_li]:text-foreground">{children}</div>
    </div>
  );
}
