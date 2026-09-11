import Link from "next/link";
import { Badge } from "@cofounderai/core/ui/badge";
import { NativeSelect } from "@cofounderai/core/ui/native-select";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { formatDateTime } from "@cofounderai/core/lib/format";
import type { BuyerPersonIntelligence } from "../../lib/buyer-intelligence/types";
import {
  CONTACTABILITY_LABEL,
  RELEVANCE_LABEL,
  SENIORITY_LABEL,
} from "../../lib/buyer-intelligence/types";
import { PERSONA_ROLE_LABEL } from "../../lib/personas/types";
import type { Prospect } from "../../lib/prospects/types";
import type { ResearchBrief } from "../../lib/research-briefs/types";
import { EVIDENCE_TYPE_LABEL } from "../../lib/research/types";
import type { ProspectResearch } from "../../lib/research/types";
import type { ProspectScore } from "../../lib/scoring/types";
import { SCORE_COMPONENT_LABEL } from "../../lib/opportunities/scoring";
import type { Signal } from "../../lib/signals/types";
import { SIGNAL_TYPE_LABEL } from "../../lib/signals/types";
import {
  NEXT_BEST_ACTION_LABEL,
  OPPORTUNITY_STATUS_LABEL,
  type Opportunity,
  type OpportunityStatus,
} from "../../lib/opportunities/types";

const STATUS_OPTIONS: OpportunityStatus[] = ["new", "reviewing", "action_required", "watching", "dismissed", "expired"];

const CONFIDENCE_BADGE_CLASS: Record<"low" | "medium" | "high", string> = {
  high: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-muted text-muted-foreground",
};

function ConfidenceBadge({ confidence }: { confidence: "low" | "medium" | "high" }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${CONFIDENCE_BADGE_CLASS[confidence]}`}>
      {confidence} confidence
    </span>
  );
}

/**
 * DISC-OFFER-P0-07.3: "Opportunity Detail" -- the doc's own ten-section list, minus one
 * deliberate omission: "Feedback" has no real capture mechanism anywhere in this module
 * yet (`DISC-OFFER-P1-04.1`/`04.2`, "Learn From User Edits"/"Learn From Outcomes", own
 * that as their own future P1 stories) -- building a feedback widget with nothing behind
 * it now would be exactly the speculative-functionality CLAUDE.md dev principle #7
 * forbids, the same call 06.2 already made not to front-run 07.1's own recommended-action
 * vocabulary. Every other section renders real data already produced by an earlier story
 * in this run (05.1-06.3): nothing here is invented for this view specifically.
 */
export function OpportunityDetail({
  businessId,
  productId,
  opportunity,
  prospect,
  signals,
  research,
  researchBrief,
  primaryContact,
  scoreHistory,
  updateStatusAction,
}: {
  businessId: string;
  productId: string;
  opportunity: Opportunity;
  prospect: Prospect;
  signals: Signal[];
  research: ProspectResearch | null;
  researchBrief: ResearchBrief | null;
  primaryContact: BuyerPersonIntelligence | null;
  scoreHistory: ProspectScore[];
  updateStatusAction: (formData: FormData) => Promise<void>;
}) {
  const prospectPath = `/dashboard/businesses/${businessId}/products/${productId}/prospects/${prospect.id}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={`/dashboard/businesses/${businessId}/products/${productId}/opportunities`} className="text-sm text-muted-foreground hover:underline">
          ← Back to opportunities
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">
            <Link href={prospectPath} className="hover:underline">
              {prospect.company_name}
            </Link>
          </h1>
          <Badge variant="outline">{OPPORTUNITY_STATUS_LABEL[opportunity.status]}</Badge>
          <Badge variant={opportunity.priority === "high" ? "destructive" : opportunity.priority === "medium" ? "secondary" : "outline"}>
            {opportunity.priority} priority
          </Badge>
        </div>
      </div>

      {/* "Actions must be clearly grouped" (doc's own words) -- the one action this view
          owns directly: a manual status override, kept apart from every read-only
          section below it. */}
      <section className="flex flex-col gap-2 rounded-md border p-4">
        <h2 className="font-medium">Actions</h2>
        <form action={updateStatusAction} className="flex flex-wrap items-center gap-2">
          <NativeSelect name="status" defaultValue={opportunity.status} className="w-auto">
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {OPPORTUNITY_STATUS_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
          <SubmitButton size="sm" variant="outline" pendingText="Updating...">
            Update status
          </SubmitButton>
        </form>
        <p className="text-xs text-muted-foreground">
          Sending to CRM is a dedicated handoff, not a plain status change -- see the prospect page's own "Send to CRM" action.
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded-md border p-4">
        <div className="flex items-center gap-2">
          <h2 className="font-medium">Score</h2>
          {opportunity.score !== null ? <span className="text-2xl font-semibold">{opportunity.score}</span> : <span className="text-muted-foreground">—</span>}
          <ConfidenceBadge confidence={opportunity.confidence} />
        </div>
        {opportunity.score_reason ? <p className="text-sm text-muted-foreground">{opportunity.score_reason}</p> : null}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          {(
            [
              ["icpFit", opportunity.icp_fit_score],
              ["buyerFit", opportunity.buyer_fit_score],
              ["needFit", opportunity.need_fit_score],
              ["timing", opportunity.timing_score],
              ["signalStrength", opportunity.signal_strength_score],
              ["contactability", opportunity.contactability_score],
              ["evidenceConfidence", opportunity.evidence_confidence_score],
            ] as const
          ).map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs text-muted-foreground">{SCORE_COMPONENT_LABEL[key]}</dt>
              <dd className="font-medium">{value ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-2 rounded-md border p-4">
        <div className="flex items-center gap-2">
          <h2 className="font-medium">Why Now</h2>
          <ConfidenceBadge confidence={opportunity.why_now_confidence} />
        </div>
        <p className="text-sm text-muted-foreground">{opportunity.why_now ?? "No why-now claim on record yet."}</p>
      </section>

      <section className="flex flex-col gap-2 rounded-md border p-4">
        <h2 className="font-medium">Why Them</h2>
        <p className="text-sm text-muted-foreground">{opportunity.why_them ?? "No offering-fit narrative on record yet."}</p>
      </section>

      <section className="flex flex-col gap-2 rounded-md border p-4">
        <h2 className="font-medium">Primary Contact</h2>
        {!primaryContact ? (
          <p className="text-sm text-muted-foreground">
            No contacts recorded yet. <Link href={`${prospectPath}#buyer-intelligence`} className="underline underline-offset-4">Add one on the prospect page.</Link>
          </p>
        ) : (
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{primaryContact.name}</span>
              {primaryContact.title ? <span className="text-muted-foreground">— {primaryContact.title}</span> : null}
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{SENIORITY_LABEL[primaryContact.seniority]}</span>
              {primaryContact.persona ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{PERSONA_ROLE_LABEL[primaryContact.persona.role_in_committee]}</span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Relevance: {RELEVANCE_LABEL[primaryContact.relevance]} — {primaryContact.relevanceReason}
            </p>
            <p className="text-xs text-muted-foreground">
              Contactability: {CONTACTABILITY_LABEL[primaryContact.contactability]} — {primaryContact.contactabilityReason}
            </p>
            <Link href={`${prospectPath}#buyer-intelligence`} className="text-xs underline underline-offset-4">
              View full buyer intelligence
            </Link>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-md border p-4">
        <h2 className="font-medium">Signals</h2>
        {signals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No signals recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {signals.map((signal) => (
              <li key={signal.id} className="text-muted-foreground">
                <span className="rounded bg-muted px-1 text-xs">{SIGNAL_TYPE_LABEL[signal.signal_type]}</span> {signal.description}{" "}
                <span className="text-xs">({formatDateTime(signal.observed_at)})</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-md border p-4">
        <h2 className="font-medium">Evidence</h2>
        {!research || research.evidence.length === 0 ? (
          <p className="text-sm text-muted-foreground">No evidence recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {research.evidence.map((item, i) => (
              <li key={i} className="text-muted-foreground">
                <span className="rounded bg-muted px-1 text-xs">{EVIDENCE_TYPE_LABEL[item.evidence_type]}</span> {item.statement}
                {item.source || item.observed_at ? (
                  <span className="text-xs"> ({[item.source, item.observed_at].filter(Boolean).join(", ")})</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-md border p-4">
        <div className="flex items-center gap-2">
          <h2 className="font-medium">Research Brief</h2>
          {researchBrief ? <ConfidenceBadge confidence={researchBrief.confidence} /> : null}
        </div>
        {!researchBrief ? (
          <p className="text-sm text-muted-foreground">
            Not generated yet. <Link href={`${prospectPath}#research-brief`} className="underline underline-offset-4">Generate one on the prospect page.</Link>
          </p>
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            <p><span className="font-medium">Offering fit: </span><span className="text-muted-foreground">{researchBrief.offering_fit}</span></p>
            <p><span className="font-medium">Problem hypothesis: </span><span className="text-muted-foreground">{researchBrief.problem_hypothesis}</span></p>
            <p><span className="font-medium">Potential objection: </span><span className="text-muted-foreground">{researchBrief.potential_objection}</span></p>
            <p><span className="font-medium">Suggested opening: </span><span className="text-muted-foreground">{researchBrief.suggested_opening}</span></p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-md border p-4">
        <h2 className="font-medium">Recommended Action</h2>
        {opportunity.recommended_action ? (
          <>
            <p className="font-medium">{NEXT_BEST_ACTION_LABEL[opportunity.recommended_action]}</p>
            {opportunity.recommended_action_reason ? (
              <p className="text-sm text-muted-foreground">{opportunity.recommended_action_reason}</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No recommendation computed yet.</p>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-md border p-4">
        <h2 className="font-medium">History</h2>
        <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Created</dt>
            <dd>{formatDateTime(opportunity.created_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Last evaluated</dt>
            <dd>{opportunity.last_evaluated_at ? formatDateTime(opportunity.last_evaluated_at) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Last updated</dt>
            <dd>{formatDateTime(opportunity.updated_at)}</dd>
          </div>
        </dl>
        {scoreHistory.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Prospect score history</p>
            <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
              {scoreHistory.map((score) => (
                <li key={score.id}>
                  {formatDateTime(score.created_at)}: overall {score.overall_score} (ICP {score.icp_score}, intent {score.intent_score}, timing {score.timing_score})
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
