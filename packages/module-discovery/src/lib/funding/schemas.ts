import { z } from "zod";
import { currency, lines, optionalDate, optionalMoney, optionalText, optionalUrl, optionalUuid } from "../shared/form-fields";
import {
  DATA_ROOM_CATEGORIES,
  DILIGENCE_STATUSES,
  INTERACTION_TYPES,
  INVESTOR_SOURCES,
  INVESTOR_TYPES,
  PROVENANCES,
  READINESS_CATEGORIES,
  READINESS_STATUSES,
  RESEARCH_FIELDS,
  ROUND_TYPES,
  SENSITIVITIES,
} from "./types";

/**
 * FND-01 — validation at the server boundary (§37.4). Money always travels with a
 * currency; nothing here accepts a figure the database would then have to guess the
 * meaning of.
 */

const optionalEmail = z
  .string()
  .trim()
  .max(320)
  .optional()
  .nullable()
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address.");

const needsCurrency = (amounts: (number | null)[], cur: string | null) => amounts.some((a) => a !== null) && !cur;

export const roundInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name the round.").max(200),
    roundType: z.enum(ROUND_TYPES, { message: "Choose the round type." }),
    isPrimary: z
      .union([z.boolean(), z.string()])
      .optional()
      .transform((v) => v === true || v === "on" || v === "true" || v === undefined),
    targetAmount: optionalMoney,
    minimumAmount: optionalMoney,
    maximumAmount: optionalMoney,
    currency,
    instrument: optionalText(200),
    preMoneyValuation: optionalMoney,
    postMoneyValuation: optionalMoney,
    targetCloseDate: optionalDate,
    useOfFunds: optionalText(4000),
    notes: optionalText(4000),
  })
  .superRefine((v, ctx) => {
    const amounts = [v.targetAmount, v.minimumAmount, v.maximumAmount, v.preMoneyValuation, v.postMoneyValuation];
    if (needsCurrency(amounts, v.currency)) {
      ctx.addIssue({ code: "custom", path: ["currency"], message: "Say which currency the amounts are in." });
    }
    if (v.minimumAmount !== null && v.maximumAmount !== null && v.minimumAmount > v.maximumAmount) {
      ctx.addIssue({ code: "custom", path: ["minimumAmount"], message: "The minimum cannot be above the maximum." });
    }
  });
export type RoundInput = z.output<typeof roundInputSchema>;

export const investorInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name the investor or fund.").max(300),
    email: optionalEmail,
    investorType: z.enum(INVESTOR_TYPES, { message: "Choose the investor type." }),
    website: optionalUrl,
    geographies: lines(20),
    stages: lines(20),
    sectors: lines(30),
    checkMin: optionalMoney,
    checkMax: optionalMoney,
    currency,
    source: z.enum(INVESTOR_SOURCES).default("other"),
    sourceNote: optionalText(1000),
    notes: optionalText(4000),
  })
  .superRefine((v, ctx) => {
    if (needsCurrency([v.checkMin, v.checkMax], v.currency)) {
      ctx.addIssue({ code: "custom", path: ["currency"], message: "Say which currency the cheque size is in." });
    }
    if (v.checkMin !== null && v.checkMax !== null && v.checkMin > v.checkMax) {
      ctx.addIssue({ code: "custom", path: ["checkMin"], message: "The smallest cheque cannot be above the largest." });
    }
  });
export type InvestorInput = z.output<typeof investorInputSchema>;

export const contactInputSchema = z.object({
  firstName: z.string().trim().min(1, "Enter the contact's name.").max(200),
  lastName: optionalText(200),
  jobTitle: optionalText(200),
  email: optionalEmail,
  linkedinUrl: optionalUrl,
});
export type ContactInput = z.output<typeof contactInputSchema>;

/** A research finding. "Source-backed" needs the source (§26.1). */
export const researchInputSchema = z
  .object({
    field: z.enum(RESEARCH_FIELDS),
    content: z.string().trim().min(1, "Write the finding.").max(8000),
    provenance: z.enum(PROVENANCES).default("user_entered"),
    sourceUrl: optionalUrl,
    sourceTitle: optionalText(300),
  })
  .superRefine((v, ctx) => {
    if (v.provenance === "source_backed" && !v.sourceUrl) {
      ctx.addIssue({ code: "custom", path: ["sourceUrl"], message: "A source-backed finding needs the link it came from." });
    }
  });
export type ResearchInput = z.output<typeof researchInputSchema>;

export const interactionInputSchema = z.object({
  investorId: z.uuid({ message: "Choose the investor." }),
  contactId: optionalUuid,
  roundId: optionalUuid,
  interactionType: z.enum(INTERACTION_TYPES),
  occurredAt: z
    .string()
    .trim()
    .min(1, "When did it happen?")
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Enter a valid date."),
  subject: optionalText(300),
  notes: optionalText(8000),
  outcome: optionalText(2000),
  nextAction: optionalText(500),
  nextActionDue: optionalDate,
});
export type InteractionInput = z.output<typeof interactionInputSchema>;

export const outreachInputSchema = z.object({
  investorId: z.uuid({ message: "Choose the investor." }),
  contactId: optionalUuid,
  roundId: optionalUuid,
  subject: z.string().trim().min(1, "Write a subject line.").max(300),
  body: z.string().trim().min(1, "Write the message.").max(20000),
  personalizationNotes: optionalText(4000),
  cta: optionalText(300),
});
export type OutreachInput = z.output<typeof outreachInputSchema>;

export const readinessInputSchema = z.object({
  category: z.enum(READINESS_CATEGORIES),
  title: z.string().trim().min(1, "Name the item.").max(300),
  description: optionalText(4000),
  missingInformation: optionalText(4000),
  recommendedAction: optionalText(2000),
  dueAt: optionalDate,
  evidenceNote: optionalText(4000),
  evidenceUrl: optionalUrl,
});
export type ReadinessInput = z.output<typeof readinessInputSchema>;

export const readinessStatusSchema = z.enum(READINESS_STATUSES);

export const dataRoomItemInputSchema = z.object({
  name: z.string().trim().min(1, "Name the document.").max(300),
  category: z.enum(DATA_ROOM_CATEGORIES),
  roundId: optionalUuid,
  description: optionalText(2000),
  sensitivity: z.enum(SENSITIVITIES).default("confidential"),
  expiresAt: optionalDate,
});
export type DataRoomItemInput = z.output<typeof dataRoomItemInputSchema>;

/** Days a share link stays valid when the founder does not choose (§29.6: expiry is required). */
export const DEFAULT_SHARE_DAYS = 14;
export const MAX_SHARE_DAYS = 90;

export const shareInputSchema = z
  .object({
    investorId: optionalUuid,
    recipientEmail: optionalEmail,
    permission: z.enum(["view", "download"]).default("view"),
    days: z.coerce.number().int().min(1, "At least one day.").max(MAX_SHARE_DAYS, `At most ${MAX_SHARE_DAYS} days.`).default(DEFAULT_SHARE_DAYS),
  })
  .superRefine((v, ctx) => {
    if (!v.investorId && !v.recipientEmail) {
      ctx.addIssue({ code: "custom", path: ["recipientEmail"], message: "Share with an investor or an email address." });
    }
  });
export type ShareInput = z.output<typeof shareInputSchema>;

export const diligenceInputSchema = z.object({
  request: z.string().trim().min(1, "Write the request.").max(4000),
  requester: optionalText(300),
  investorId: optionalUuid,
  roundId: optionalUuid,
  dueAt: optionalDate,
});
export type DiligenceInput = z.output<typeof diligenceInputSchema>;

export const diligenceResponseSchema = z.object({
  response: optionalText(20000),
  notes: optionalText(4000),
  dataRoomItemIds: z.array(z.uuid()).max(50).default([]),
});
export type DiligenceResponseInput = z.output<typeof diligenceResponseSchema>;

export const diligenceStatusSchema = z.enum(DILIGENCE_STATUSES);

const tractionEntry = z.object({
  metric: z.string().trim().min(1).max(200),
  value: z.string().trim().min(1).max(200),
  period: optionalText(100),
  source: z.string().trim().min(1, "Every traction figure needs its source.").max(500),
  provenance: z.enum(PROVENANCES).default("user_entered"),
});

export const profileInputSchema = z.object({
  companyGeography: optionalText(300),
  companyFounded: optionalText(50),
  companyTeam: optionalText(4000),
  companySummary: optionalText(4000),
  productProblem: optionalText(4000),
  productDifferentiation: optionalText(4000),
  productEvidence: optionalText(4000),
  marketTarget: optionalText(4000),
  marketGeography: optionalText(1000),
  marketSegmentation: optionalText(4000),
  marketEvidence: optionalText(4000),
  modelPricing: optionalText(2000),
  modelRevenue: optionalText(2000),
  modelContract: optionalText(2000),
  modelRecurring: optionalText(500),
  objectiveAmount: optionalMoney,
  objectiveCurrency: currency,
  objectiveInstrument: optionalText(200),
  objectiveUseOfFunds: optionalText(4000),
  objectiveTargetClose: optionalDate,
  traction: z.array(tractionEntry).max(30).default([]),
}).superRefine((v, ctx) => {
  if (v.objectiveAmount !== null && !v.objectiveCurrency) {
    ctx.addIssue({ code: "custom", path: ["objectiveCurrency"], message: "Say which currency the target is in." });
  }
});
export type ProfileInput = z.output<typeof profileInputSchema>;

export { firstIssue } from "../marketing/schemas";
