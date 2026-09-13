import type { DashboardBin } from "../opportunities/dashboard";
import type { OpportunityPriority } from "../opportunities/types";
import type { OpportunitySummary } from "../opportunities/queries";

export type { OpportunitySummary };

/**
 * DISC-OFFER-P1 §7-04 "Multi-Offering Intelligence" -- both stories in this epic
 * (§7-04.1 "Cross-Offering Account View", §7-04.2 "Offering Portfolio Dashboard") are
 * business-level rollups over the same per-offering (per-workspace) data every other
 * offering-scoped page in this module already reads -- batched across a business's own
 * offerings the same way `lib/dashboard/queries.ts` already batches across every
 * workspace on a whole account for the Executive Dashboard, just scoped one level
 * narrower. No new table: every field below is read live from `opportunities`/
 * `prospects`/`conversations`, never a stored/duplicated copy (the same "never invent
 * state nothing keeps current" discipline DISC-OFFER-P1 §7-01.3's own watchlist rows
 * already applied to "current score"/"last signal").
 */

export type OfferingPortfolioRow = {
  productId: string;
  productName: string;
  workspaceId: string;
  hotCount: number;
  newCount: number;
  conversationCount: number;
};

export type AccountOfferingEntry = {
  productId: string;
  productName: string;
  prospectId: string;
  score: number | null;
  priority: OpportunityPriority | null;
  bin: DashboardBin | null;
};

export type CrossOfferingAccount = {
  key: string;
  companyName: string;
  domain: string | null;
  offerings: AccountOfferingEntry[];
};
