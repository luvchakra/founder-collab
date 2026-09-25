import type { CampaignMetricRow } from "./types";

/**
 * MKT-03/MKT-14 — marketing metric arithmetic.
 *
 * The one rule everything here serves (spec §7, §10, §40, §52.9, §61): a number the
 * business never supplied must reach the screen as "unavailable", not as 0. A campaign
 * with no spend recorded has not spent ₹0; a CPL with no attributed leads is not ₹0 or
 * infinite. So every figure is `number | null`, every ratio refuses to compute over a
 * missing or zero denominator, and every figure carries the definition a "How
 * calculated" affordance shows (§73).
 */

export interface Metric {
  /** null = the inputs needed to compute this were not reported. */
  value: number | null;
  definition: string;
}

type CountField =
  | "impressions"
  | "clicks"
  | "sessions"
  | "engagements"
  | "leads"
  | "qualifiedLeads"
  | "opportunities"
  | "customers";
type MoneyField = "revenue" | "spend";

/**
 * Sum of a field across snapshots — or null when *no* snapshot reported it at all. One
 * reported value among many unreported rows still sums to that value: the total is "what
 * was reported", and the definition says so, rather than pretending the silent rows were
 * zeros or discarding the one that spoke.
 */
export function sumReported(rows: CampaignMetricRow[], field: CountField | MoneyField): number | null {
  let seen = false;
  let total = 0;
  for (const row of rows) {
    const v = row[field];
    if (v === null || v === undefined) continue;
    seen = true;
    total += Number(v);
  }
  if (!seen) return null;
  return field === "revenue" || field === "spend" ? Math.round(total * 100) / 100 : total;
}

/** A ratio that is null unless both sides were reported and the denominator is positive. */
export function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return numerator / denominator;
}

export interface CampaignTotals {
  spend: Metric;
  revenue: Metric;
  impressions: Metric;
  clicks: Metric;
  sessions: Metric;
  engagements: Metric;
  leads: Metric;
  qualifiedLeads: Metric;
  opportunities: Metric;
  customers: Metric;
  costPerLead: Metric;
  costPerQualifiedLead: Metric;
  costPerOpportunity: Metric;
  leadToCustomer: Metric;
  /** Currencies seen in the snapshots. More than one means money totals are unsafe. */
  currencies: string[];
}

/**
 * Totals and derived ratios for a set of snapshots (one campaign, or a whole portfolio).
 *
 * Money is only summed when every snapshot that reported money did so in the same
 * currency. Adding rupees to dollars produces a number with no meaning, so with mixed
 * currencies spend, revenue and every cost ratio come back null and `currencies` says
 * why (§35.3: "do not mix currencies in a single aggregate").
 */
export function campaignTotals(rows: CampaignMetricRow[]): CampaignTotals {
  const currencies = [
    ...new Set(
      rows
        .filter((r) => r.spend !== null || r.revenue !== null)
        .map((r) => r.currency)
        .filter((c): c is string => Boolean(c)),
    ),
  ].sort();
  const mixedCurrency = currencies.length > 1;

  const spend = mixedCurrency ? null : sumReported(rows, "spend");
  const revenue = mixedCurrency ? null : sumReported(rows, "revenue");
  const leads = sumReported(rows, "leads");
  const qualifiedLeads = sumReported(rows, "qualifiedLeads");
  const opportunities = sumReported(rows, "opportunities");
  const customers = sumReported(rows, "customers");

  const moneyNote = mixedCurrency ? " Unavailable while snapshots use more than one currency." : "";

  return {
    spend: { value: spend, definition: `Sum of reported spend across metric snapshots.${moneyNote}` },
    revenue: { value: revenue, definition: `Sum of reported attributed revenue.${moneyNote}` },
    impressions: { value: sumReported(rows, "impressions"), definition: "Sum of reported impressions." },
    clicks: { value: sumReported(rows, "clicks"), definition: "Sum of reported clicks." },
    sessions: { value: sumReported(rows, "sessions"), definition: "Sum of reported website sessions." },
    engagements: { value: sumReported(rows, "engagements"), definition: "Sum of reported engagements." },
    leads: { value: leads, definition: "Sum of reported leads." },
    qualifiedLeads: { value: qualifiedLeads, definition: "Sum of reported qualified leads." },
    opportunities: { value: opportunities, definition: "Sum of reported opportunities." },
    customers: { value: customers, definition: "Sum of reported customers." },
    costPerLead: {
      value: ratio(spend, leads),
      definition: `Campaign spend ÷ reported leads. Shown only when both are reported and leads are above zero.${moneyNote}`,
    },
    costPerQualifiedLead: {
      value: ratio(spend, qualifiedLeads),
      definition: `Campaign spend ÷ reported qualified leads.${moneyNote}`,
    },
    costPerOpportunity: {
      value: ratio(spend, opportunities),
      definition: `Campaign spend ÷ reported opportunities.${moneyNote}`,
    },
    leadToCustomer: {
      value: ratio(customers, leads),
      definition: "Reported customers ÷ reported leads.",
    },
    currencies,
  };
}

export const FUNNEL_STAGES = [
  { key: "sessions", label: "Traffic" },
  { key: "engagements", label: "Engagement" },
  { key: "leads", label: "Prospect" },
  { key: "qualifiedLeads", label: "Qualified prospect" },
  { key: "opportunities", label: "Opportunity" },
  { key: "customers", label: "Customer" },
] as const satisfies readonly { key: CountField; label: string }[];

export interface FunnelStage {
  key: CountField;
  label: string;
  count: number | null;
  /** Share of the previous stage that reached this one; null when either is unreported. */
  conversionFromPrevious: number | null;
}

/** The marketing funnel (§7, §17.1) with a conversion only where both ends were reported. */
export function marketingFunnel(rows: CampaignMetricRow[]): FunnelStage[] {
  let previous: number | null = null;
  return FUNNEL_STAGES.map((stage, index) => {
    const count = sumReported(rows, stage.key);
    const conversion = index === 0 ? null : ratio(count, previous);
    previous = count;
    return { key: stage.key, label: stage.label, count, conversionFromPrevious: conversion };
  });
}

/** Formats a metric for display, with the em dash the spec asks for when unavailable (§7). */
export function formatMetric(
  value: number | null,
  kind: "count" | "percent" | "money",
  currency?: string | null,
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (kind === "percent") return `${(value * 100).toFixed(1)}%`;
  if (kind === "money") {
    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: currency || "INR",
        maximumFractionDigits: 0,
      }).format(value);
    } catch {
      return `${currency ?? ""} ${Math.round(value).toLocaleString("en-IN")}`.trim();
    }
  }
  return Math.round(value).toLocaleString("en-IN");
}
