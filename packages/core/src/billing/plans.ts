/**
 * Fixed "buy monthly AI credits" plans (Razorpay, INR) -- a few preset packages rather
 * than an arbitrary top-up amount, matching how the free tier already caps usage by run
 * count (module-discovery/lib/usage/limits.ts), not by an open-ended $ figure. Runs (not
 * $ of AI spend) are the purchasable unit for the same reason: the exact $ cost of a run
 * varies by provider/model/prompt, so "N extra runs" is the number a founder can actually
 * reason about, and it's what core.ai_credit_balances.remaining_runs tracks.
 *
 * A plain TS constant, not a DB table: nothing here is ever written by the app itself
 * (no admin UI to manage plans exists, or is planned), so a table would just be a second
 * place these same three rows live, out of sync by construction. Revisit if/when plans
 * need to change without a deploy.
 */
export type CreditPlan = {
  key: string;
  label: string;
  credited_runs: number;
  /** Razorpay's own unit -- INR paise (1/100 of a rupee), never a fractional-rupee float. */
  amount_inr_paise: number;
};

export const CREDIT_PLANS: CreditPlan[] = [
  { key: "starter", label: "Starter", credited_runs: 500, amount_inr_paise: 1_000_00 },
  { key: "growth", label: "Growth", credited_runs: 1500, amount_inr_paise: 2_500_00 },
  { key: "scale", label: "Scale", credited_runs: 4000, amount_inr_paise: 6_000_00 },
];

export function getCreditPlan(key: string): CreditPlan | undefined {
  return CREDIT_PLANS.find((p) => p.key === key);
}
