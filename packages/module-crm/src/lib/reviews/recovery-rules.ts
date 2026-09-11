import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../../db/server";
import { createAdminClient } from "../../db/admin";
import { createFollowUp } from "../follow-ups/mutations";
import { createLead, convertLeadToOpportunity } from "../leads/mutations";
import type { ReviewItem } from "./types";

const RECOVERY_DUE_DAYS = 2;
const ADVOCACY_DUE_DAYS = 7;

export type ReviewRecoveryResult =
  | { applied: false; reason: "already_applied" | "no_rating" }
  | { applied: true; kind: "recovery"; followUpId: string }
  | { applied: true; kind: "advocacy"; followUpId: string; opportunityId: string | null };

/**
 * CRM-08.7's three rules -- "1-3 star review -> recovery task", "4-5 star review ->
 * advocacy/review-follow-up opportunity where appropriate" (below;
 * `escalateOverdueNegativeReviewFollowUps()` further down is the third, "unresolved
 * negative review -> escalation") -- applied once per review, called from
 * `syncGoogleBusinessProfileReviews()` for every review a sync returns.
 *
 * Idempotent via `crm.follow_up`'s own unique `(business_id, review_item_id)` index:
 * checked explicitly here (rather than relying on the DB to throw and swallowing that
 * error) so a re-sync of an already-handled review is a clean no-op, and a genuine
 * duplicate-key bug elsewhere still surfaces. `crm.follow_up` -- not `crm.activity` --
 * is what a review-triggered task attaches to, because `crm.activity`'s "attached to
 * something" check (party/lead/opportunity/conversation) can essentially never be
 * satisfied for a review: `party_id` is null in the common case (CRM-08.5's own design
 * -- no phone/email to match a reviewer on), and a review has no lead/opportunity/
 * conversation of its own until this function creates one. `crm.follow_up` has no such
 * constraint, so it's the one entity that can represent "a task about this review" on
 * its own.
 *
 * The advocacy branch only creates a real `crm.opportunity` "where appropriate" --
 * appropriateness here being the one condition that's actually checkable: whether the
 * review is linked to a known party at all (`review_item.party_id`, set only when a
 * later story adds real reviewer-identity matching). Without a party there is no one to
 * open a sales opportunity *for* (`crm.opportunity.party_id` is `not null`), so the
 * follow-up task alone -- itself the literal "review-follow-up" half of this rule's own
 * name -- is what "where appropriate" degrades to. This is the same "honest gap until
 * its own data exists" discipline `CRM-09.2`'s "related product" column and CRM-08.5's
 * own `party_id` already established, not a shortcut invented for this story.
 *
 * "No automatic promise of compensation or resolution" holds by construction: neither
 * branch writes any note/body text at all -- `crm.follow_up` has no such column -- so
 * there is no channel for one to leak through even by accident.
 */
export async function applyReviewRecoveryRules(businessId: string, reviewId: string): Promise<ReviewRecoveryResult> {
  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase.from("follow_up").select("id").eq("business_id", businessId).eq("review_item_id", reviewId).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { applied: false, reason: "already_applied" };

  const { data: review, error: reviewError } = await supabase.from("review_item").select("*").eq("id", reviewId).eq("business_id", businessId).single();
  if (reviewError) throw reviewError;
  const reviewRow = review as ReviewItem;
  if (reviewRow.rating == null) return { applied: false, reason: "no_rating" };

  const now = Date.now();

  if (reviewRow.rating <= 3) {
    const followUp = await createFollowUp(businessId, {
      partyId: reviewRow.party_id,
      reviewItemId: reviewId,
      dueAt: new Date(now + RECOVERY_DUE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      // 1-2 stars starts at this priority scale's own ceiling ('high') so a genuinely
      // bad review is never mistaken for routine; 3 stars starts at 'normal' -- still
      // negative, but escalateOverdueNegativeReviewFollowUps() below is what bumps it to
      // 'high' if it then goes unresolved past its due date.
      priority: reviewRow.rating <= 2 ? "high" : "normal",
    });
    return { applied: true, kind: "recovery", followUpId: followUp.id };
  }

  const followUp = await createFollowUp(businessId, {
    partyId: reviewRow.party_id,
    reviewItemId: reviewId,
    dueAt: new Date(now + ADVOCACY_DUE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    priority: "normal",
  });

  let opportunityId: string | null = null;
  if (reviewRow.party_id) {
    const lead = await createLead(businessId, {
      partyId: reviewRow.party_id,
      source: "google",
      sourceModule: "review_item",
      sourceReference: reviewId,
    });
    opportunityId = (await convertLeadToOpportunity(businessId, lead.id)).opportunityId;
    const { error: linkError } = await supabase.from("follow_up").update({ opportunity_id: opportunityId }).eq("id", followUp.id).eq("business_id", businessId);
    if (linkError) throw linkError;
  }

  return { applied: true, kind: "advocacy", followUpId: followUp.id, opportunityId };
}

/**
 * CRM-08.7's third rule, "unresolved negative review -> escalation": a 1-3 star
 * review's own recovery task (above) that's still `pending` past its `due_at`, on a
 * review that's still not `responded`/`dismissed`, is exactly "unresolved negative
 * review" made concrete. Bumps the follow-up's priority to this scale's ceiling
 * ('high') -- never downgrades one already there -- rather than inventing a fourth
 * priority tier or a separate "escalated" flag; the existing Follow-ups queue's own
 * high-priority view already surfaces the result with no UI change needed.
 *
 * Admin-scoped and cross-tenant (mirrors `whatsapp/health.ts#checkAllWhatsAppConnectionsHealth`'s
 * own periodic-sweep shape) since a cron invocation has no business or session of its
 * own to resolve.
 */
export async function escalateOverdueNegativeReviewFollowUps(client?: SupabaseClient): Promise<{ checked: number; escalated: number }> {
  const admin = client ?? createAdminClient();
  const now = new Date().toISOString();

  const { data: candidates, error } = await admin
    .from("follow_up")
    .select("id, business_id, review_item_id")
    .eq("status", "pending")
    .eq("priority", "normal")
    .lt("due_at", now)
    .not("review_item_id", "is", null);
  if (error) throw error;
  if (!candidates || candidates.length === 0) return { checked: 0, escalated: 0 };

  const reviewItemIds = [...new Set(candidates.map((c) => c.review_item_id as string))];
  const { data: reviewItems, error: reviewItemsError } = await admin.from("review_item").select("id, status, rating").in("id", reviewItemIds);
  if (reviewItemsError) throw reviewItemsError;
  const reviewItemById = new Map((reviewItems ?? []).map((r) => [r.id, r]));

  const overdueUnresolvedNegative = candidates.filter((row) => {
    const review = reviewItemById.get(row.review_item_id as string);
    return review && review.rating != null && review.rating <= 3 && review.status !== "responded" && review.status !== "dismissed";
  });

  let escalated = 0;
  for (const row of overdueUnresolvedNegative) {
    const { error: updateError } = await admin.from("follow_up").update({ priority: "high" }).eq("id", row.id).eq("business_id", row.business_id);
    if (updateError) throw updateError;
    escalated += 1;
  }

  return { checked: candidates.length, escalated };
}
