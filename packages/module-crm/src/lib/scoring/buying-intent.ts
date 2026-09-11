import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createClient } from "../../db/server";
import { getCustomer360 } from "../customer-360/queries";
import { listInteractionsForParty } from "../interactions/queries";
import { listOpportunitiesWithFsmQuoteForParty } from "../opportunities/queries";

export type BuyingIntentSignal = {
  key: string;
  label: string;
  points: number;
  maxPoints: number;
  /** Human-readable source evidence for this signal -- CRM-12.5's own "user can see
   * source evidence" acceptance criterion, so a founder never has to trust the number
   * without seeing what produced it. `null` when the signal contributed nothing. */
  evidence: string | null;
};

export type BuyingIntentScoreResult = {
  score: number;
  signals: BuyingIntentSignal[];
};

function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * CRM-12.5's "Buying Intent Score" -- a deterministic weighted sum over real CRM/cross-
 * module data (CLAUDE.md principle 4: never an LLM call for something this
 * reproducible). Each signal's own point contribution and evidence is returned
 * alongside the total, satisfying "explainable contributing signals" / "user can see
 * source evidence" directly rather than needing a separate lookup. Weights are
 * deliberately simple and capped per-signal (no single input can dominate the score),
 * summing to a 0-100 range.
 */
export async function calculateBuyingIntentScore(businessId: string, partyId: string): Promise<BuyingIntentScoreResult> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "crm.view");

  const supabase = await createClient();
  const [customer360, interactions, opportunitiesWithFsmQuote, reviewsResult] = await Promise.all([
    getCustomer360(businessId, partyId),
    listInteractionsForParty(businessId, partyId),
    listOpportunitiesWithFsmQuoteForParty(businessId, partyId),
    supabase.from("review_item").select("rating, comment_excerpt").eq("business_id", businessId).eq("party_id", partyId),
  ]);
  if (reviewsResult.error) throw reviewsResult.error;
  const reviews = reviewsResult.data ?? [];

  const signals: BuyingIntentSignal[] = [];

  // Discovery buying signal.
  const buyingSignalCount = customer360.prospect?.buyingSignals.length ?? 0;
  signals.push({
    key: "discovery_buying_signal",
    label: "Discovery buying signals",
    points: Math.min(buyingSignalCount * 5, 20),
    maxPoints: 20,
    evidence: buyingSignalCount > 0 ? `${buyingSignalCount} signal(s): ${customer360.prospect!.buyingSignals.slice(0, 3).join("; ")}` : null,
  });

  // Interaction recency.
  const lastInteraction = interactions.length > 0 ? interactions[interactions.length - 1] : null;
  const recencyDays = lastInteraction ? daysSince(lastInteraction.occurred_at) : null;
  const recencyPoints = recencyDays === null ? 0 : recencyDays <= 2 ? 20 : recencyDays <= 7 ? 10 : recencyDays <= 30 ? 5 : 0;
  signals.push({
    key: "interaction_recency",
    label: "Interaction recency",
    points: recencyPoints,
    maxPoints: 20,
    evidence: recencyDays === null ? null : `Last interaction ${recencyDays} day(s) ago`,
  });

  // Customer reply behavior: how many inbound messages actually got a reply.
  const respondedInbound = interactions.filter((i) => i.direction === "inbound" && i.status === "responded").length;
  signals.push({
    key: "reply_behavior",
    label: "Customer reply behavior",
    points: respondedInbound >= 2 ? 15 : respondedInbound === 1 ? 8 : 0,
    maxPoints: 15,
    evidence: respondedInbound > 0 ? `${respondedInbound} inbound message(s) with a completed back-and-forth` : null,
  });

  // Product interest.
  const productCount = customer360.productsOfInterest.length;
  signals.push({
    key: "product_interest",
    label: "Product interest",
    points: Math.min(productCount * 5, 15),
    maxPoints: 15,
    evidence: productCount > 0 ? `${productCount} product(s): ${customer360.productsOfInterest.slice(0, 3).map((p) => p.itemName).join(", ")}` : null,
  });

  // Quote activity: an FSM quote outranks a bare open opportunity -- it's a concrete
  // step further down the funnel (CRM-11's own quote bridge).
  const hasQuote = opportunitiesWithFsmQuote.length > 0;
  const hasOpenOpportunity = customer360.openOpportunities.length > 0;
  signals.push({
    key: "quote_activity",
    label: "Quote activity",
    points: hasQuote ? 15 : hasOpenOpportunity ? 8 : 0,
    maxPoints: 15,
    evidence: hasQuote ? "An FSM quote has been created" : hasOpenOpportunity ? `${customer360.openOpportunities.length} open opportunity/ies` : null,
  });

  // Appointment activity.
  const jobCount = customer360.recentJobs.length;
  signals.push({
    key: "appointment_activity",
    label: "Appointment activity",
    points: Math.min(jobCount * 7, 15),
    maxPoints: 15,
    evidence: jobCount > 0 ? `${jobCount} service job(s) on file` : null,
  });

  // Review/feedback, where applicable.
  const bestRating = reviews.reduce((max, r) => (r.rating != null && r.rating > max ? r.rating : max), 0);
  const reviewPoints = bestRating >= 4 ? 10 : reviews.length > 0 ? 5 : 0;
  signals.push({
    key: "review_feedback",
    label: "Review / feedback",
    points: reviewPoints,
    maxPoints: 10,
    evidence: reviews.length > 0 ? `${reviews.length} review(s)${bestRating > 0 ? `, best rating ${bestRating}/5` : ""}` : null,
  });

  const score = Math.min(signals.reduce((sum, s) => sum + s.points, 0), 100);
  return { score, signals };
}

/** Reads the cached score without recalculating -- the Customer 360 page's own initial
 * render never triggers a recalculation (and its audit entry) just from being viewed. */
export async function getBuyingIntentScore(businessId: string, partyId: string): Promise<{ score: number; signals: BuyingIntentSignal[]; calculatedAt: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("buying_intent_score")
    .select("score, signals, calculated_at")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .maybeSingle();
  if (error) throw error;
  return data ? { score: data.score, signals: data.signals as BuyingIntentSignal[], calculatedAt: data.calculated_at } : null;
}

/**
 * The explicit "Recalculate" button's own action -- computes a fresh score, stores it
 * (one row per customer, same shape as `crm.customer_summary`), and writes an audit log
 * entry recording the before/after score. That audit trail is CRM-12.5's own "score
 * recalculation is auditable" criterion: every recalculation is a visible, attributable
 * event in the business's Audit Log, not a silent background update.
 */
export async function recalculateBuyingIntentScore(businessId: string, partyId: string): Promise<BuyingIntentScoreResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: existing, error: existingError } = await supabase
    .from("buying_intent_score")
    .select("id, score")
    .eq("business_id", businessId)
    .eq("party_id", partyId)
    .maybeSingle();
  if (existingError) throw existingError;

  const result = await calculateBuyingIntentScore(businessId, partyId);

  const { data: upserted, error: upsertError } = await supabase
    .from("buying_intent_score")
    .upsert(
      { business_id: businessId, party_id: partyId, score: result.score, signals: result.signals, calculated_at: new Date().toISOString() },
      { onConflict: "business_id,party_id" },
    )
    .select("id")
    .single();
  if (upsertError) throw upsertError;

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_buying_intent.recalculated",
    entityType: "crm_buying_intent_score",
    entityId: upserted.id,
    before: existing ? { score: existing.score } : null,
    after: { score: result.score },
  });

  return result;
}
