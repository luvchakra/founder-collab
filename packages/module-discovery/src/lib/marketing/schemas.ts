import { z } from "zod";
import {
  ASSET_TYPES,
  CAMPAIGN_OBJECTIVES,
  CONTENT_TYPES,
  MARKETING_CHANNELS,
  METRIC_SOURCES,
  SEO_CATEGORIES,
  SEO_SEVERITIES,
} from "./types";

/**
 * MKT-01 — validation at the server boundary (§37.4). Forms validate for the user's
 * sake; these validate because the server cannot trust the form. Every mutation parses
 * its input through one of these before touching the database, and the database's own
 * check constraints stand behind them as the last line.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid().nullable());

const optionalDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || !Number.isNaN(new Date(v).getTime()), "Enter a valid date.");

const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\//i.test(v), "Links must start with http:// or https://.");

const optionalMoney = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "Enter a number." });
      return z.NEVER;
    }
    if (n < 0) {
      ctx.addIssue({ code: "custom", message: "Amounts cannot be negative." });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });

const optionalCount = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").trim());
    if (!Number.isInteger(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "Counts must be whole numbers, zero or more." });
      return z.NEVER;
    }
    return n;
  });

const currency = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^[A-Z]{3}$/.test(v), "Use a three-letter currency code such as INR.");

export const campaignInputSchema = z
  .object({
    name: z.string().trim().min(1, "Give the campaign a name.").max(200),
    description: optionalText(4000),
    objective: z.enum(CAMPAIGN_OBJECTIVES, { message: "Choose an objective." }),
    channel: z.enum(MARKETING_CHANNELS, { message: "Choose a channel." }),
    offeringId: optionalUuid,
    icpProfileId: optionalUuid,
    budget: optionalMoney,
    currency,
    startAt: optionalDate,
    endAt: optionalDate,
    landingPageUrl: optionalUrl,
    message: optionalText(4000),
    cta: optionalText(300),
    utmSource: optionalText(200),
    utmMedium: optionalText(200),
    utmCampaign: optionalText(200),
    notes: optionalText(4000),
  })
  .superRefine((v, ctx) => {
    if (v.startAt && v.endAt && new Date(v.endAt) < new Date(v.startAt)) {
      ctx.addIssue({ code: "custom", path: ["endAt"], message: "The end date cannot be before the start date." });
    }
    if (v.budget !== null && !v.currency) {
      ctx.addIssue({ code: "custom", path: ["currency"], message: "Say which currency the budget is in." });
    }
  });
export type CampaignInput = z.output<typeof campaignInputSchema>;

export const metricSnapshotSchema = z
  .object({
    metricDate: z.iso.date({ message: "Enter the date these numbers are for." }),
    source: z.enum(METRIC_SOURCES).default("manual"),
    impressions: optionalCount,
    clicks: optionalCount,
    sessions: optionalCount,
    engagements: optionalCount,
    leads: optionalCount,
    qualifiedLeads: optionalCount,
    opportunities: optionalCount,
    customers: optionalCount,
    revenue: optionalMoney,
    spend: optionalMoney,
    currency,
  })
  .superRefine((v, ctx) => {
    if ((v.spend !== null || v.revenue !== null) && !v.currency) {
      ctx.addIssue({ code: "custom", path: ["currency"], message: "Say which currency the money figures are in." });
    }
    const counts = [
      v.impressions,
      v.clicks,
      v.sessions,
      v.engagements,
      v.leads,
      v.qualifiedLeads,
      v.opportunities,
      v.customers,
      v.revenue,
      v.spend,
    ];
    // A snapshot that reports nothing is not a snapshot. Blank means "not reported"
    // (null), so an all-blank form must be refused rather than stored as a row of nulls.
    if (counts.every((c) => c === null)) {
      ctx.addIssue({ code: "custom", message: "Enter at least one number." });
    }
  });
export type MetricSnapshotInput = z.output<typeof metricSnapshotSchema>;

export const contentInputSchema = z.object({
  title: z.string().trim().min(1, "Give the content a title.").max(300),
  contentType: z.enum(CONTENT_TYPES, { message: "Choose a content type." }),
  offeringId: optionalUuid,
  campaignId: optionalUuid,
  brief: optionalText(4000),
  body: optionalText(100_000),
  summary: optionalText(2000),
  audience: optionalText(500),
  channel: optionalText(100),
  cta: optionalText(300),
  seoTitle: optionalText(300),
  seoDescription: optionalText(500),
});
export type ContentInput = z.output<typeof contentInputSchema>;

const lines = (max: number) =>
  z
    .string()
    .optional()
    .nullable()
    .transform((v) =>
      (v ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, max),
    );

export const strategyInputSchema = z.object({
  name: z.string().trim().min(1, "Give the strategy a name.").max(200),
  offeringId: optionalUuid,
  category: optionalText(300),
  targetProblem: optionalText(2000),
  positioningStatement: optionalText(2000),
  marketContext: optionalText(4000),
  headline: optionalText(500),
  supportingPoints: lines(20),
  proofPoints: lines(20),
  differentiators: lines(20),
  competitorStatements: lines(20),
  whyUs: optionalText(2000),
  regions: lines(30),
  industries: lines(30),
  companySegments: lines(30),
  buyerSegments: lines(30),
  keyMessages: lines(20),
  channels: z.array(z.enum(MARKETING_CHANNELS)).max(MARKETING_CHANNELS.length).default([]),
});
export type StrategyInput = z.output<typeof strategyInputSchema>;

export const strategyGoalSchema = z.object({
  name: z.string().trim().min(1, "Name the goal.").max(200),
  metric: z.string().trim().min(1, "Say what the goal measures.").max(200),
  target: optionalMoney,
  period: z.string().trim().min(1, "Say over what period.").max(100),
  status: z.enum(["not_started", "on_track", "at_risk", "achieved", "missed"]).default("not_started"),
});

export const seoItemInputSchema = z.object({
  title: z.string().trim().min(1, "Describe the issue.").max(300),
  category: z.enum(SEO_CATEGORIES),
  severity: z.enum(SEO_SEVERITIES).default("medium"),
  pageUrl: optionalUrl,
  description: optionalText(4000),
  recommendedAction: optionalText(2000),
  evidenceNote: optionalText(4000),
});
export type SeoItemInput = z.output<typeof seoItemInputSchema>;

export const assetInputSchema = z.object({
  name: z.string().trim().min(1, "Name the asset.").max(300),
  assetType: z.enum(ASSET_TYPES),
  altText: optionalText(500),
  description: optionalText(2000),
  campaignId: optionalUuid,
  offeringId: optionalUuid,
});
export type AssetInput = z.output<typeof assetInputSchema>;

/** First human-readable message from a failed parse, for an action's `{ error }`. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Some of the details are not valid.";
}
