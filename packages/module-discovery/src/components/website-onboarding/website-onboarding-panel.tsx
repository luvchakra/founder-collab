"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, GitMerge, Loader2, Pencil, RefreshCw, Sparkles, Trash2, XCircle } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Badge } from "@cofounderai/core/ui/badge";
import { Checkbox } from "@cofounderai/core/ui/checkbox";
import { Input } from "@cofounderai/core/ui/input";
import { Label } from "@cofounderai/core/ui/label";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { toast } from "@cofounderai/core/ui/sonner";
import type { WebsiteBusinessProfile, WebsiteFieldStatus, WebsiteOfferingCandidate } from "../../lib/ai/schemas";
import type { CrawledPage } from "../../lib/ai/website-crawl";
import { OFFERING_TYPE_LABEL, OFFERING_TYPE_VALUES, type OfferingType } from "../../lib/offerings/types";
import { WEBSITE_PAGE_CATEGORY_LABEL, type WebsitePageCategory } from "../../lib/website-onboarding/crawl-plan";
import { mergeOfferingCandidates, type EditableOfferingCandidate } from "../../lib/website-onboarding/offering-review";
import type {
  WebsiteOnboardingOfferingCandidate,
  WebsiteOnboardingPage,
  WebsiteOnboardingRun,
  WebsiteOnboardingStatus,
} from "../../lib/website-onboarding/types";
import { WEBSITE_FIELD_STATUS_LABEL, WEBSITE_LIST_FIELDS, WEBSITE_TEXT_FIELDS } from "./field-labels";

type RetryResult = { error: string } | { success: true; run: WebsiteOnboardingRun };
type ApplyResult = { error: string } | { success: true };
type ActivateResult = { error: string } | { success: true; created: number };

type StreamEvent =
  | { type: "progress"; profile: Record<string, unknown> }
  | { type: "page"; page: CrawledPage }
  | { type: "offerings-progress"; offerings: Record<string, unknown> }
  | { type: "done"; profile: WebsiteBusinessProfile; offerings: WebsiteOfferingCandidate[] }
  | { type: "error"; error: string }
  | { type: "noop"; status: WebsiteOnboardingStatus };

/** A crawled page as tracked client-side, whether it arrived live via a "page" stream
 * event (camelCase, matches CrawledPage) or was loaded from the DB on page render
 * (snake_case, matches WebsiteOnboardingPage) -- normalized to one shape so the render
 * code below doesn't need to know which source it came from. */
type CrawledPageView = { url: string; category: WebsitePageCategory; status: "succeeded" | "failed"; error: string | null };

function fromInitialPage(page: WebsiteOnboardingPage): CrawledPageView {
  return { url: page.url, category: page.category, status: page.status, error: page.error };
}
function fromStreamedPage(page: CrawledPage): CrawledPageView {
  return { url: page.url, category: page.category, status: page.status, error: page.error };
}

/** A proposed offering as tracked client-side, whether loaded from the DB on page render
 * (snake_case, matches WebsiteOnboardingOfferingCandidate) or received in the stream's
 * final "done" event (camelCase, matches WebsiteOfferingCandidate) -- normalized to one
 * shape for the same reason CrawledPageView is above. `id` is a stable client-side key
 * (the DB row id when one exists, a generated one for a just-streamed candidate that
 * hasn't been persisted from this browser's own point of view yet) -- DISC-OFFER-P0-09.4
 * uses it to track which proposed offerings are selected, being edited, or merged. */
type OfferingCandidateView = {
  id: string;
  name: string;
  description: string;
  offeringType: OfferingType | null;
  problemSolved: string | null;
  targetCustomer: string | null;
  targetIndustry: string | null;
  valueProposition: string | null;
  evidence: string;
  confidence: number;
  sourcePages: string[];
};

function fromInitialOffering(offering: WebsiteOnboardingOfferingCandidate): OfferingCandidateView {
  return {
    id: offering.id,
    name: offering.name,
    description: offering.description,
    offeringType: offering.offering_type,
    problemSolved: offering.problem_solved,
    targetCustomer: offering.target_customer,
    targetIndustry: offering.target_industry,
    valueProposition: offering.value_proposition,
    evidence: offering.evidence,
    confidence: offering.confidence,
    sourcePages: offering.source_pages,
  };
}
let clientOfferingIdCounter = 0;
function fromStreamedOffering(offering: WebsiteOfferingCandidate): OfferingCandidateView {
  clientOfferingIdCounter += 1;
  return {
    id: `streamed-${clientOfferingIdCounter}`,
    name: offering.name,
    description: offering.description,
    offeringType: offering.offeringType as OfferingType | null,
    problemSolved: offering.problemSolved,
    targetCustomer: offering.targetCustomer,
    targetIndustry: offering.targetIndustry,
    valueProposition: offering.valueProposition,
    evidence: offering.evidence,
    confidence: offering.confidence,
    sourcePages: offering.sourcePages,
  };
}

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
  initialPages = [],
  initialOfferings = [],
  retryAction,
  applyAction,
  activateOfferingsAction,
}: {
  businessId: string;
  initialRun: WebsiteOnboardingRun;
  /** The prior crawl's own pages (DISC-OFFER-P0-09.2), loaded from
   * discovery.website_onboarding_pages -- empty for a `pending` run that hasn't crawled
   * anything yet. */
  initialPages?: WebsiteOnboardingPage[];
  /** The prior run's own proposed offerings (DISC-OFFER-P0-09.3), loaded from
   * discovery.website_onboarding_offering_candidates -- empty for a `pending` run or one
   * whose extraction hasn't completed yet. DISC-OFFER-P0-09.4 turns these into editable,
   * mergeable, removable rows the founder explicitly activates. */
  initialOfferings?: WebsiteOnboardingOfferingCandidate[];
  retryAction: () => Promise<RetryResult>;
  applyAction: () => Promise<ApplyResult>;
  /** DISC-OFFER-P0-09.4's own "Create Offerings" -- creates one real
   * `discovery.products` row per surviving reviewed offering. */
  activateOfferingsAction: (offerings: EditableOfferingCandidate[]) => Promise<ActivateResult>;
}) {
  const router = useRouter();
  const [run, setRun] = useState(initialRun);
  const [streaming, setStreaming] = useState(false);
  const [progressFieldCount, setProgressFieldCount] = useState(0);
  const [progressOfferingCount, setProgressOfferingCount] = useState(0);
  const [pages, setPages] = useState<CrawledPageView[]>(initialPages.map(fromInitialPage));
  const [offerings, setOfferings] = useState<OfferingCandidateView[]>(initialOfferings.map(fromInitialOffering));
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [offeringsActivated, setOfferingsActivated] = useState(!!initialRun.activated_at);
  const startedRunIds = useRef(new Set<string>());

  async function startRun(runId: string) {
    if (startedRunIds.current.has(runId)) return;
    startedRunIds.current.add(runId);
    setStreaming(true);
    setProgressFieldCount(0);
    setProgressOfferingCount(0);
    setPages([]);
    setOfferings([]);

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
          } else if (event.type === "page") {
            setPages((prev) => [...prev, fromStreamedPage(event.page)]);
          } else if (event.type === "offerings-progress") {
            setProgressOfferingCount(Array.isArray(event.offerings.offerings) ? event.offerings.offerings.length : 0);
          } else if (event.type === "done") {
            setRun((r) => ({ ...r, status: "succeeded", profile: event.profile, error: null }));
            setOfferings(event.offerings.map(fromStreamedOffering));
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
    setOfferingsActivated(false);
    setPages([]);
    setOfferings([]);
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
      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-3">
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          <span>
            {pages.length === 0
              ? `Reading ${run.website}...`
              : progressOfferingCount > 0
                ? `Found ${progressOfferingCount} offering${progressOfferingCount === 1 ? "" : "s"} on ${run.website} so far...`
                : `Crawled ${pages.length} page${pages.length === 1 ? "" : "s"} on ${run.website} so far, building your business profile...`}
            {progressFieldCount > 0 && progressOfferingCount === 0
              ? ` (${progressFieldCount} of ${WEBSITE_TEXT_FIELDS.length + WEBSITE_LIST_FIELDS.length} fields so far)`
              : ""}
          </span>
        </div>
        {pages.length > 0 ? <CrawledPageList pages={pages} /> : null}
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
        {pages.length > 0 ? <CrawledPageList pages={pages} /> : null}
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

        {pages.length > 0 ? <CrawledPageList pages={pages} /> : null}

        {offerings.length > 0 ? (
          offeringsActivated ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              <span>Offerings created -- see them below in this business&apos;s offering list.</span>
            </div>
          ) : (
            <OfferingActivationReview
              offerings={offerings}
              activateAction={activateOfferingsAction}
              onActivated={() => {
                setOfferingsActivated(true);
                router.refresh();
              }}
            />
          )
        ) : null}

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

/**
 * DISC-OFFER-P0-09.2's own "crawl progress is visible" / "extracted facts retain source
 * references": a compact list of every page the crawl attempted, each with its own source
 * URL and a succeeded/failed indicator -- shown live (from the "page" stream events) while
 * a run is in progress, and from the persisted `discovery.website_onboarding_pages` rows
 * on reload once it's finished, so this survives a page refresh rather than only existing
 * for the one browser tab that watched the stream.
 */
function CrawledPageList({ pages }: { pages: CrawledPageView[] }) {
  return (
    <ul className="flex flex-col gap-1 rounded-lg border border-border/60 bg-background/50 p-2 text-xs">
      {pages.map((page, i) => (
        <li key={`${page.url}-${i}`} className="flex items-center gap-2">
          {page.status === "succeeded" ? (
            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
          ) : (
            <XCircle className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />
          )}
          <span className="font-medium">{WEBSITE_PAGE_CATEGORY_LABEL[page.category]}</span>
          <span className="truncate text-muted-foreground">{page.url}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * DISC-OFFER-P0-09.4 "Offering Review Before Activation" -- the doc's own mockup
 * ("We found 4 Business Offerings" + checkmarks + [Edit] [Merge] [Remove] +
 * [Create Offerings]): every proposed offering starts selected, the founder can edit any
 * field inline, remove one they don't want, select two or more to merge into one, and
 * finally activate the surviving, reviewed list into real `discovery.products` rows.
 * Local-only state (id/included/editing) lives here rather than being lifted into the
 * parent panel -- once this run has succeeded, nothing outside this component needs to
 * know about an in-progress edit or merge selection, only the final activation result.
 */
function OfferingActivationReview({
  offerings,
  activateAction,
  onActivated,
}: {
  offerings: OfferingCandidateView[];
  activateAction: (offerings: EditableOfferingCandidate[]) => Promise<ActivateResult>;
  onActivated: () => void;
}) {
  const [items, setItems] = useState<OfferingCandidateView[]>(offerings);
  const [included, setIncluded] = useState<Set<string>>(() => new Set(offerings.map((o) => o.id)));
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  function toggleIncluded(id: string, checked: boolean) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleMergeSelected(id: string, checked: boolean) {
    setSelectedForMerge((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function updateField(id: string, patch: Partial<EditableOfferingCandidate>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function handleRemove(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setIncluded((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setSelectedForMerge((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (editingId === id) setEditingId(null);
  }

  function handleMerge() {
    const toMerge = items.filter((item) => selectedForMerge.has(item.id));
    if (toMerge.length < 2) return;
    const merged = mergeOfferingCandidates(toMerge);
    clientOfferingIdCounter += 1;
    const mergedItem: OfferingCandidateView = {
      ...merged,
      id: `merged-${clientOfferingIdCounter}`,
      evidence: toMerge.map((item) => item.evidence).filter(Boolean).join(" "),
      confidence: Math.max(...toMerge.map((item) => item.confidence)),
    };
    setItems((prev) => [...prev.filter((item) => !selectedForMerge.has(item.id)), mergedItem]);
    setIncluded((prev) => {
      const next = new Set([...prev].filter((id) => !selectedForMerge.has(id)));
      next.add(mergedItem.id);
      return next;
    });
    setSelectedForMerge(new Set());
    setEditingId(mergedItem.id);
  }

  async function handleActivate() {
    const toCreate = items.filter((item) => included.has(item.id));
    if (toCreate.length === 0) return;
    setActivating(true);
    const result = await activateAction(toCreate.map(stripReviewOnlyFields));
    setActivating(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    onActivated();
    toast.success(`Created ${result.created} offering${result.created === 1 ? "" : "s"}.`);
  }

  const includedCount = items.filter((item) => included.has(item.id)).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          We found {items.length} Business Offering{items.length === 1 ? "" : "s"}
        </p>
        {selectedForMerge.size >= 2 ? (
          <Button type="button" variant="outline" size="sm" onClick={handleMerge}>
            <GitMerge className="size-3.5" aria-hidden="true" />
            Merge {selectedForMerge.size} selected
          </Button>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <OfferingReviewCard
            key={item.id}
            item={item}
            included={included.has(item.id)}
            mergeSelected={selectedForMerge.has(item.id)}
            editing={editingId === item.id}
            onToggleIncluded={(checked) => toggleIncluded(item.id, checked)}
            onToggleMergeSelected={(checked) => toggleMergeSelected(item.id, checked)}
            onEdit={() => setEditingId(item.id)}
            onDoneEditing={() => setEditingId(null)}
            onChange={(patch) => updateField(item.id, patch)}
            onRemove={() => handleRemove(item.id)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
        <p className="text-xs text-muted-foreground">
          {includedCount} of {items.length} selected to create.
        </p>
        <Button type="button" size="sm" disabled={activating || includedCount === 0} onClick={handleActivate}>
          <Sparkles className="size-3.5" aria-hidden="true" />
          {activating ? "Creating..." : `Create ${includedCount} Offering${includedCount === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}

function stripReviewOnlyFields(item: OfferingCandidateView): EditableOfferingCandidate {
  return {
    name: item.name,
    description: item.description,
    offeringType: item.offeringType,
    problemSolved: item.problemSolved,
    targetCustomer: item.targetCustomer,
    targetIndustry: item.targetIndustry,
    valueProposition: item.valueProposition,
    sourcePages: item.sourcePages,
  };
}

/** One offering in the review list: display mode (name, type/confidence badges,
 * description, the doc's own field list, evidence quote, source links, plus the
 * include checkbox, merge checkbox, Edit and Remove actions) or edit mode (inline
 * inputs for every field this offering can carry into `createOffering()`, per this
 * platform's own "inline editing over navigating to a separate page" design rule). */
function OfferingReviewCard({
  item,
  included,
  mergeSelected,
  editing,
  onToggleIncluded,
  onToggleMergeSelected,
  onEdit,
  onDoneEditing,
  onChange,
  onRemove,
}: {
  item: OfferingCandidateView;
  included: boolean;
  mergeSelected: boolean;
  editing: boolean;
  onToggleIncluded: (checked: boolean) => void;
  onToggleMergeSelected: (checked: boolean) => void;
  onEdit: () => void;
  onDoneEditing: () => void;
  onChange: (patch: Partial<EditableOfferingCandidate>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <label className="flex min-w-0 items-center gap-2">
          <Checkbox checked={included} onCheckedChange={(checked) => onToggleIncluded(checked === true)} aria-label={`Include ${item.name}`} />
          {editing ? (
            <Input value={item.name} onChange={(e) => onChange({ name: e.target.value })} className="h-8 w-56" aria-label="Offering name" />
          ) : (
            <span className="truncate font-medium">{item.name}</span>
          )}
        </label>
        <div className="flex shrink-0 items-center gap-1.5">
          {!editing && item.offeringType ? <Badge variant="outline">{OFFERING_TYPE_LABEL[item.offeringType]}</Badge> : null}
          {!editing ? <Badge variant="secondary">{Math.round(item.confidence * 100)}% confidence</Badge> : null}
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <Checkbox checked={mergeSelected} onCheckedChange={(checked) => onToggleMergeSelected(checked === true)} aria-label={`Select ${item.name} to merge`} />
            Merge
          </label>
          <Button type="button" variant="ghost" size="icon" className="size-7" onClick={editing ? onDoneEditing : onEdit} aria-label={editing ? "Done editing" : `Edit ${item.name}`}>
            <Pencil className="size-3.5" aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={onRemove} aria-label={`Remove ${item.name}`}>
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${item.id}-description`}>Description</Label>
            <Textarea id={`${item.id}-description`} value={item.description} onChange={(e) => onChange({ description: e.target.value })} rows={2} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${item.id}-type`}>Offering type</Label>
              <NativeSelect
                id={`${item.id}-type`}
                value={item.offeringType ?? ""}
                onChange={(e) => onChange({ offeringType: (e.target.value || null) as OfferingType | null })}
              >
                <option value="">Not set</option>
                {OFFERING_TYPE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {OFFERING_TYPE_LABEL[value]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${item.id}-problem`}>Problem solved</Label>
              <Input id={`${item.id}-problem`} value={item.problemSolved ?? ""} onChange={(e) => onChange({ problemSolved: e.target.value || null })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${item.id}-customer`}>Target customer</Label>
              <Input id={`${item.id}-customer`} value={item.targetCustomer ?? ""} onChange={(e) => onChange({ targetCustomer: e.target.value || null })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${item.id}-industry`}>Target industry</Label>
              <Input id={`${item.id}-industry`} value={item.targetIndustry ?? ""} onChange={(e) => onChange({ targetIndustry: e.target.value || null })} />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor={`${item.id}-value-prop`}>Value proposition</Label>
              <Input id={`${item.id}-value-prop`} value={item.valueProposition ?? ""} onChange={(e) => onChange({ valueProposition: e.target.value || null })} />
            </div>
          </div>
        </div>
      ) : (
        <>
          <p className="text-muted-foreground">{item.description}</p>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
            {item.problemSolved ? (
              <div>
                <dt className="font-medium text-foreground">Problem solved</dt>
                <dd className="text-muted-foreground">{item.problemSolved}</dd>
              </div>
            ) : null}
            {item.targetCustomer ? (
              <div>
                <dt className="font-medium text-foreground">Target customer</dt>
                <dd className="text-muted-foreground">{item.targetCustomer}</dd>
              </div>
            ) : null}
            {item.targetIndustry ? (
              <div>
                <dt className="font-medium text-foreground">Target industry</dt>
                <dd className="text-muted-foreground">{item.targetIndustry}</dd>
              </div>
            ) : null}
            {item.valueProposition ? (
              <div>
                <dt className="font-medium text-foreground">Value proposition</dt>
                <dd className="text-muted-foreground">{item.valueProposition}</dd>
              </div>
            ) : null}
          </dl>
          {item.evidence ? (
            <p className="border-l-2 border-border pl-2 text-xs italic text-muted-foreground">&ldquo;{item.evidence}&rdquo;</p>
          ) : null}
          {item.sourcePages.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>Source{item.sourcePages.length === 1 ? "" : "s"}:</span>
              {item.sourcePages.map((url) => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="truncate text-primary underline-offset-2 hover:underline">
                  {url}
                </a>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
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
