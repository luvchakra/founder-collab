import { classifyOpportunityForDashboard } from "../opportunities/dashboard";
import type { Prospect } from "../prospects/types";
import type { AccountOfferingEntry, CrossOfferingAccount, OpportunitySummary } from "./types";

/**
 * Normalizes a company identity for grouping -- domain first (the more reliable signal
 * when on file: two prospect rows sharing a domain are the same real company, "Acme.com"
 * vs "acme.com" case aside), the company name otherwise (trimmed, lowercased, internal
 * whitespace collapsed). The same "no fixed catalog exists, so match the free text
 * honestly" reasoning DISC-OFFER-P1 §7-01.1's own `matchesDiscoveryCriteria` already
 * applied to industry/location/buyer-role filters, applied here to company identity
 * instead -- `discovery.prospects` has no structured company-identity key any more than
 * it has a structured industry one.
 *
 * Deliberately an EXACT match, never a fuzzy/substring one (§7-01.1's own filters are
 * deliberately "contains", this is deliberately not): a false MERGE of two different
 * real companies into one account here would be a worse mistake than a false split of
 * one real company into two, since a merge could show one founder's own contact/score
 * data under a company name it doesn't actually belong to.
 */
export function accountKeyFor(prospect: Pick<Prospect, "domain" | "company_name">): string {
  if (prospect.domain && prospect.domain.trim()) return `domain:${prospect.domain.trim().toLowerCase()}`;
  return `name:${prospect.company_name.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

const RESOLVED_OPPORTUNITY_STATUSES = new Set(["sent_to_crm", "dismissed", "expired"]);

/**
 * DISC-OFFER-P1 §7-04.1 "Cross-Offering Account View" -- one row per real company that
 * has a prospect record under two or more of this business's own offerings, each paired
 * with that offering's own best (highest-scored) still-open opportunity, if any. Every
 * offering stays fully independent (the doc's own explicit "keep opportunities
 * independent") -- this is a read-only rollup over already-independent rows, never a
 * merge of the underlying `prospects`/`opportunities` records themselves.
 *
 * A company on file under only one offering is deliberately NOT shown here: that's
 * already this module's ordinary per-offering Prospects list, and listing every
 * single-offering account again on this page would bury the actual cross-offering
 * overlap this story exists to surface (CLAUDE.md dev principle #7 -- build only what
 * the story asks, not a second copy of an existing list).
 */
export function groupIntoCrossOfferingAccounts(
  prospects: { prospect: Prospect; productId: string; productName: string }[],
  opportunities: OpportunitySummary[],
): CrossOfferingAccount[] {
  const opportunitiesByProspectId = new Map<string, OpportunitySummary[]>();
  for (const o of opportunities) {
    const list = opportunitiesByProspectId.get(o.prospect_id) ?? [];
    list.push(o);
    opportunitiesByProspectId.set(o.prospect_id, list);
  }

  const byKey = new Map<string, CrossOfferingAccount>();

  for (const { prospect, productId, productName } of prospects) {
    const key = accountKeyFor(prospect);
    let group = byKey.get(key);
    if (!group) {
      group = { key, companyName: prospect.company_name, domain: prospect.domain, offerings: [] };
      byKey.set(key, group);
    }

    const open = (opportunitiesByProspectId.get(prospect.id) ?? []).filter((o) => !RESOLVED_OPPORTUNITY_STATUSES.has(o.status));
    const best = open.length > 0 ? open.reduce((a, b) => ((b.score ?? -1) > (a.score ?? -1) ? b : a)) : null;

    const entry: AccountOfferingEntry = {
      productId,
      productName,
      prospectId: prospect.id,
      score: best?.score ?? null,
      priority: best?.priority ?? null,
      bin: best ? classifyOpportunityForDashboard(best) : null,
    };
    group.offerings.push(entry);
  }

  return [...byKey.values()]
    .filter((group) => new Set(group.offerings.map((o) => o.productId)).size > 1)
    .sort((a, b) => a.companyName.localeCompare(b.companyName));
}
