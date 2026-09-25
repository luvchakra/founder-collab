import { resolveBusinessSlugById } from "@cofounderai/core/businesses/resolve";
import { createClient } from "../../db/server";
import type { Alert } from "./derive";

/**
 * MKT-15 / FND-17 / INT-04 — Marketing and Funding items for the platform's existing alert
 * bell. Only things someone has to act on (§18: "avoid noisy reminders"), each linking to
 * where it is acted on. Funding counts come back as zero for anyone without funding.view,
 * because RLS hides those rows — so the bell never leaks that a round exists.
 */
export interface MarketingFundingCounts {
  contentAwaitingApproval: number;
  scheduledPastDue: number;
  campaignsEndingSoon: number;
  outreachAwaitingApproval: number;
  outreachFailed: number;
  diligenceOverdue: number;
  investorFollowUpsOverdue: number;
}

export function marketingFundingAlerts(counts: MarketingFundingCounts, businessId: string, slug: string): Alert[] {
  const m = `/${slug}/discovery/marketing`;
  const f = `/${slug}/discovery/funding`;
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const alerts: Alert[] = [];
  const push = (id: string, n: number, severity: Alert["severity"], message: string, href: string) => {
    if (n > 0) alerts.push({ id: `${id}-${businessId}`, severity, message, href, businessId });
  };
  push("mkt-overdue", counts.scheduledPastDue, "warning", `${counts.scheduledPastDue} scheduled ${plural(counts.scheduledPastDue, "post is", "posts are")} past due and still unpublished.`, `${m}/content?status=scheduled`);
  push("fnd-outreach-failed", counts.outreachFailed, "warning", `${counts.outreachFailed} investor ${plural(counts.outreachFailed, "email", "emails")} failed to send.`, `${f}/outreach?status=failed`);
  push("fnd-diligence-overdue", counts.diligenceOverdue, "warning", `${counts.diligenceOverdue} diligence ${plural(counts.diligenceOverdue, "request is", "requests are")} overdue.`, `${f}/due-diligence`);
  push("mkt-review", counts.contentAwaitingApproval, "info", `${counts.contentAwaitingApproval} marketing ${plural(counts.contentAwaitingApproval, "item awaits", "items await")} approval.`, `${m}/content?status=review`);
  push("mkt-ending", counts.campaignsEndingSoon, "info", `${counts.campaignsEndingSoon} ${plural(counts.campaignsEndingSoon, "campaign ends", "campaigns end")} within 3 days.`, `${m}/campaigns?status=active&sort=end_date`);
  push("fnd-outreach-approval", counts.outreachAwaitingApproval, "info", `${counts.outreachAwaitingApproval} investor ${plural(counts.outreachAwaitingApproval, "draft awaits", "drafts await")} approval.`, `${f}/outreach?status=awaiting_approval`);
  push("fnd-followups", counts.investorFollowUpsOverdue, "info", `${counts.investorFollowUpsOverdue} investor ${plural(counts.investorFollowUpsOverdue, "follow-up is", "follow-ups are")} overdue.`, `${f}/investors`);
  return alerts;
}

async function headCount(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await query;
  return error ? 0 : (count ?? 0);
}

/** Seven head-only counts for one business; nothing is fetched row by row. */
export async function getMarketingFundingAlerts(businessId: string, now: Date = new Date()): Promise<Alert[]> {
  const supabase = await createClient();
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const soon = new Date(now.getTime() + 3 * 86_400_000).toISOString();
  const c = (table: string) => supabase.from(table).select("id", { count: "exact", head: true }).eq("business_id", businessId);
  const [contentAwaitingApproval, scheduledPastDue, campaignsEndingSoon, outreachAwaitingApproval, outreachFailed, diligenceOverdue, investorFollowUpsOverdue, slug] =
    await Promise.all([
      headCount(c("marketing_content").eq("status", "review")),
      headCount(c("marketing_content").eq("status", "scheduled").lt("scheduled_at", nowIso)),
      headCount(c("marketing_campaigns").eq("status", "active").gte("end_at", nowIso).lte("end_at", soon)),
      headCount(c("investor_outreach").eq("status", "awaiting_approval")),
      headCount(c("investor_outreach").eq("status", "failed")),
      headCount(c("due_diligence_items").not("status", "in", "(accepted,closed)").lt("due_at", today)),
      headCount(c("investor_pipeline").not("stage", "in", "(passed,invested)").lt("next_action_due", today)),
      resolveBusinessSlugById(businessId),
    ]);
  if (!slug) return [];
  return marketingFundingAlerts(
    { contentAwaitingApproval, scheduledPastDue, campaignsEndingSoon, outreachAwaitingApproval, outreachFailed, diligenceOverdue, investorFollowUpsOverdue },
    businessId,
    slug,
  );
}
