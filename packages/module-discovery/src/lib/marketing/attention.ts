import { campaignTotals } from "./metrics";
import type { CampaignMetricRow, MarketingCampaign, MarketingContent } from "./types";

/**
 * MKT-03 / MKT-16 — the Marketing dashboard's attention panel and recommendations.
 *
 * Deterministic rules over the business's own records, not an LLM (CLAUDE.md principle 4:
 * "do not use an LLM for deterministic operations"). Each item carries what the spec asks
 * a recommendation to show (§7): the reason, the underlying data, a suggested action and
 * where it came from. Nothing here is a guess — if the data to judge a rule is missing,
 * the rule says the data is missing rather than inventing a verdict.
 */

export type AttentionSeverity = "high" | "medium" | "low";

export interface AttentionItem {
  key: string;
  severity: AttentionSeverity;
  title: string;
  reason: string;
  data: string;
  action: string;
  /** Relative to the marketing section root, e.g. `campaigns/<id>`. */
  href: string;
  source: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function marketingAttention(input: {
  campaigns: MarketingCampaign[];
  metrics: CampaignMetricRow[];
  content: MarketingContent[];
  now?: Date;
}): AttentionItem[] {
  const now = input.now ?? new Date();
  const items: AttentionItem[] = [];
  const metricsByCampaign = new Map<string, CampaignMetricRow[]>();
  for (const row of input.metrics) {
    const list = metricsByCampaign.get(row.campaignId) ?? [];
    list.push(row);
    metricsByCampaign.set(row.campaignId, list);
  }

  for (const c of input.campaigns) {
    if (c.status !== "active") continue;
    const href = `campaigns/${c.id}`;

    if (c.endAt) {
      const daysLeft = Math.ceil((new Date(c.endAt).getTime() - now.getTime()) / DAY_MS);
      if (daysLeft < 0) {
        items.push({
          key: `ended:${c.id}`,
          severity: "medium",
          title: `${c.name} is past its end date`,
          reason: "The campaign is still marked Active after its planned end date.",
          data: `End date ${c.endAt.slice(0, 10)}.`,
          action: "Complete the campaign or extend its end date.",
          href,
          source: "Campaign record",
        });
      } else if (daysLeft <= 7) {
        items.push({
          key: `ending:${c.id}`,
          severity: "low",
          title: `${c.name} ends in ${daysLeft === 0 ? "less than a day" : `${daysLeft} day${daysLeft === 1 ? "" : "s"}`}`,
          reason: "An active campaign is about to reach its planned end date.",
          data: `End date ${c.endAt.slice(0, 10)}.`,
          action: "Review results and decide whether to extend or complete it.",
          href,
          source: "Campaign record",
        });
      }
    }

    if (!c.landingPageUrl && (c.objective === "traffic" || c.objective === "lead_generation" || c.channel === "paid_search" || c.channel === "paid_social")) {
      items.push({
        key: `landing:${c.id}`,
        severity: "medium",
        title: `${c.name} has no landing page`,
        reason: "Traffic and lead campaigns need somewhere to send people.",
        data: "Landing page URL is empty.",
        action: "Add the landing page the campaign points to.",
        href: `${href}/edit`,
        source: "Campaign record",
      });
    }

    const rows = metricsByCampaign.get(c.id) ?? [];
    if (rows.length === 0) {
      items.push({
        key: `nometrics:${c.id}`,
        severity: "low",
        title: `No results recorded for ${c.name}`,
        reason: "The campaign is active but no metric snapshot exists in this period, so its performance is unknown.",
        data: "0 metric snapshots in the selected period.",
        action: "Record the latest numbers from the channel.",
        href,
        source: "Campaign metric snapshots",
      });
      continue;
    }

    const totals = campaignTotals(rows);
    const spend = totals.spend.value;
    const sameCurrency = totals.currencies.length <= 1 && (totals.currencies[0] ?? c.currency) === c.currency;
    if (c.budget !== null && spend !== null && sameCurrency) {
      if (spend > c.budget) {
        items.push({
          key: `overbudget:${c.id}`,
          severity: "high",
          title: `${c.name} is over budget`,
          reason: "Reported spend is above the planned budget.",
          data: `Spend ${spend.toLocaleString("en-IN")} vs budget ${c.budget.toLocaleString("en-IN")} ${c.currency ?? ""}.`.trim(),
          action: "Pause the campaign or raise its budget deliberately.",
          href,
          source: "Campaign budget + metric snapshots",
        });
      } else if (spend >= c.budget * 0.9) {
        items.push({
          key: `budget90:${c.id}`,
          severity: "medium",
          title: `${c.name} has used 90% of its budget`,
          reason: "Reported spend is close to the planned budget.",
          data: `Spend ${spend.toLocaleString("en-IN")} of ${c.budget.toLocaleString("en-IN")} ${c.currency ?? ""}.`.trim(),
          action: "Check pacing before the budget runs out.",
          href,
          source: "Campaign budget + metric snapshots",
        });
      }
    }

    const sessions = totals.sessions.value;
    const leads = totals.leads.value;
    if (sessions !== null && sessions >= 200 && leads !== null && leads === 0) {
      items.push({
        key: `noconvert:${c.id}`,
        severity: "medium",
        title: `${c.name} has traffic but no leads`,
        reason: "People are arriving but none have been recorded as leads — a weak conversion signal.",
        data: `${sessions.toLocaleString("en-IN")} sessions, 0 leads reported.`,
        action: "Review the landing page, offer and call to action.",
        href,
        source: "Campaign metric snapshots",
      });
    }
  }

  const awaitingApproval = input.content.filter((c) => c.status === "review");
  if (awaitingApproval.length > 0) {
    items.push({
      key: "content-review",
      severity: "medium",
      title: `${awaitingApproval.length} content item${awaitingApproval.length === 1 ? "" : "s"} awaiting approval`,
      reason: "Content cannot be scheduled or published until someone approves it.",
      data: awaitingApproval
        .slice(0, 3)
        .map((c) => c.title)
        .join(", "),
      action: "Review and approve, or send back to draft.",
      href: "content?status=review",
      source: "Content status",
    });
  }

  const overdue = input.content.filter(
    (c) => c.status === "scheduled" && c.scheduledAt && new Date(c.scheduledAt).getTime() < now.getTime(),
  );
  if (overdue.length > 0) {
    items.push({
      key: "content-overdue",
      severity: "high",
      title: `${overdue.length} scheduled item${overdue.length === 1 ? " is" : "s are"} past due`,
      reason: "Publishing is always a deliberate action here, so scheduled content waits until someone publishes it.",
      data: overdue
        .slice(0, 3)
        .map((c) => c.title)
        .join(", "),
      action: "Publish it, or reschedule.",
      href: "content?status=scheduled",
      source: "Content schedule",
    });
  }

  const order: Record<AttentionSeverity, number> = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => order[a.severity] - order[b.severity]);
}
