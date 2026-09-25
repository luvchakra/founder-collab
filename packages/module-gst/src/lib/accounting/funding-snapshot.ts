import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { getFinanceSnapshot } from "./dashboard-queries";
import { getAccountPeriodTotals } from "./report-queries";
import { profitAndLoss } from "./reports";

/**
 * FND-15 — the read-only figures Discovery's Funding pages may show (spec §32), taken from
 * the ledger at the moment of the call. Nothing is written back and nothing is cached:
 * `asOf` says when the numbers were read, so the Funding page never implies they are
 * live after the fact.
 */
export interface FundingFinanceSnapshot {
  asOf: string;
  currency: string;
  cash: number;
  receivable: number;
  payable: number;
  revenueLast3Months: number;
  /** Average monthly net result over the last three complete months; negative is a loss. */
  averageMonthlyNet: number;
  /** Average monthly loss, when there is one; null when the business is not burning cash. */
  netBurn: number | null;
  /** Months of cash at that burn; null when there is no burn to divide by. */
  runwayMonths: number | null;
  hasAccounts: boolean;
}

/** The three complete calendar months before `today`, oldest first. */
export function lastCompleteMonths(today: string, count = 3): { from: string; to: string }[] {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const months: { from: string; to: string }[] = [];
  for (let i = count; i >= 1; i -= 1) {
    const start = new Date(Date.UTC(y, m - 1 - i, 1));
    const end = new Date(Date.UTC(y, m - i, 0));
    months.push({ from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) });
  }
  return months;
}

/** Burn and runway from cash and monthly net results. No burn means no runway figure —
 * "infinite runway" is not a number worth printing. */
export function burnAndRunway(cash: number, monthlyNet: number[]): { averageMonthlyNet: number; netBurn: number | null; runwayMonths: number | null } {
  const averageMonthlyNet = monthlyNet.length ? Math.round((monthlyNet.reduce((a, b) => a + b, 0) / monthlyNet.length) * 100) / 100 : 0;
  const netBurn = averageMonthlyNet < 0 ? -averageMonthlyNet : null;
  const runwayMonths = netBurn && cash > 0 ? Math.round((cash / netBurn) * 10) / 10 : netBurn ? 0 : null;
  return { averageMonthlyNet, netBurn, runwayMonths };
}

export async function getFundingFinanceSnapshot(businessId: string): Promise<FundingFinanceSnapshot> {
  const today = new Date().toISOString().slice(0, 10);
  const months = lastCompleteMonths(today);
  const core = await createCoreClient({ schema: "core" });
  const [snapshot, settings, ...monthTotals] = await Promise.all([
    getFinanceSnapshot(businessId),
    core.from("business_settings").select("currency").eq("business_id", businessId).maybeSingle(),
    ...months.map((mo) => getAccountPeriodTotals(businessId, mo.from, mo.to)),
  ]);
  const statements = monthTotals.map((t) => profitAndLoss(t));
  const { averageMonthlyNet, netBurn, runwayMonths } = burnAndRunway(
    snapshot.cash,
    statements.map((s) => s.netProfit),
  );
  return {
    asOf: new Date().toISOString(),
    currency: (settings.data?.currency as string) ?? "INR",
    cash: snapshot.cash,
    receivable: snapshot.receivable,
    payable: snapshot.payable,
    revenueLast3Months: Math.round(statements.reduce((a, s) => a + s.totalIncome, 0) * 100) / 100,
    averageMonthlyNet,
    netBurn,
    runwayMonths,
    hasAccounts: snapshot.hasAccounts,
  };
}
