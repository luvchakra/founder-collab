/**
 * FND-01 — Funding domain types. Every enum mirrors a check constraint in
 * supabase/migrations/20260925110000_discovery_funding.sql; labels sit beside the values
 * so no screen invents its own wording.
 */

function labels<T extends string>(values: readonly T[], overrides: Partial<Record<T, string>> = {}): Record<T, string> {
  return Object.fromEntries(
    values.map((v) => [v, overrides[v] ?? v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())]),
  ) as Record<T, string>;
}

export const ROUND_TYPES = ["pre_seed", "seed", "series_a", "series_b", "bridge", "debt", "safe", "convertible_note", "other"] as const;
export type RoundType = (typeof ROUND_TYPES)[number];
export const ROUND_TYPE_LABEL = labels(ROUND_TYPES, {
  pre_seed: "Pre-Seed",
  series_a: "Series A",
  series_b: "Series B",
  safe: "SAFE",
});

export const ROUND_STATUSES = ["planning", "open", "paused", "closed", "cancelled"] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];
export const ROUND_STATUS_LABEL = labels(ROUND_STATUSES);

export const INVESTOR_TYPES = ["vc", "angel", "family_office", "corporate_vc", "accelerator", "pe", "debt", "strategic", "other"] as const;
export type InvestorType = (typeof INVESTOR_TYPES)[number];
export const INVESTOR_TYPE_LABEL = labels(INVESTOR_TYPES, { vc: "VC", corporate_vc: "Corporate VC", pe: "PE" });

export const INVESTOR_SOURCES = ["founder_network", "referral", "inbound", "event", "outbound", "accelerator", "database", "other"] as const;
export type InvestorSource = (typeof INVESTOR_SOURCES)[number];
export const INVESTOR_SOURCE_LABEL = labels(INVESTOR_SOURCES);

export const PIPELINE_STAGES = [
  "identified",
  "researched",
  "target",
  "contacted",
  "meeting",
  "partner_review",
  "due_diligence",
  "term_discussion",
  "committed",
  "invested",
  "passed",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export const PIPELINE_STAGE_LABEL = labels(PIPELINE_STAGES);

export const RESEARCH_FIELDS = [
  "thesis",
  "stage_preference",
  "sector_preference",
  "geography_preference",
  "check_range",
  "portfolio",
  "notable_investments",
  "recent_investments",
  "partners",
  "introduction_path",
  "founder_fit",
  "conflicts",
  "fit_rationale",
  "other",
] as const;
export type ResearchField = (typeof RESEARCH_FIELDS)[number];
export const RESEARCH_FIELD_LABEL = labels(RESEARCH_FIELDS, { thesis: "Investment thesis", partners: "Partners / contacts" });

export const PROVENANCES = ["source_backed", "user_entered", "ai_inferred"] as const;
export type Provenance = (typeof PROVENANCES)[number];
export const PROVENANCE_LABEL: Record<Provenance, string> = {
  source_backed: "Source-backed",
  user_entered: "User-entered",
  ai_inferred: "AI-inferred",
};

export const INTERACTION_TYPES = ["email", "call", "meeting", "demo", "partner_review", "follow_up", "note", "other"] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];
export const INTERACTION_TYPE_LABEL = labels(INTERACTION_TYPES, { follow_up: "Follow-up" });

export const OUTREACH_STATUSES = ["draft", "awaiting_approval", "approved", "sending", "sent", "failed", "replied", "closed"] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];
export const OUTREACH_STATUS_LABEL = labels(OUTREACH_STATUSES);

export const READINESS_CATEGORIES = [
  "company",
  "product",
  "market",
  "traction",
  "business_model",
  "financials",
  "team",
  "competition",
  "gtm",
  "legal_compliance",
  "fundraising_materials",
  "data_room",
] as const;
export type ReadinessCategory = (typeof READINESS_CATEGORIES)[number];
export const READINESS_CATEGORY_LABEL = labels(READINESS_CATEGORIES, {
  gtm: "GTM",
  legal_compliance: "Legal / Compliance",
});

export const READINESS_STATUSES = ["ready", "needs_attention", "missing", "not_applicable"] as const;
export type ReadinessStatus = (typeof READINESS_STATUSES)[number];
export const READINESS_STATUS_LABEL = labels(READINESS_STATUSES);

export const DATA_ROOM_CATEGORIES = [
  "company",
  "corporate",
  "product",
  "market",
  "financial",
  "legal",
  "tax",
  "contracts",
  "ip",
  "team",
  "fundraising",
  "other",
] as const;
export type DataRoomCategory = (typeof DATA_ROOM_CATEGORIES)[number];
export const DATA_ROOM_CATEGORY_LABEL = labels(DATA_ROOM_CATEGORIES, { ip: "IP" });

export const DATA_ROOM_STATUSES = ["missing", "draft", "ready", "shared", "expired"] as const;
export type DataRoomStatus = (typeof DATA_ROOM_STATUSES)[number];
export const DATA_ROOM_STATUS_LABEL = labels(DATA_ROOM_STATUSES);

export const SENSITIVITIES = ["standard", "confidential", "highly_confidential"] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];
export const SENSITIVITY_LABEL = labels(SENSITIVITIES);

export const DILIGENCE_STATUSES = ["open", "in_progress", "submitted", "accepted", "needs_clarification", "closed"] as const;
export type DiligenceStatus = (typeof DILIGENCE_STATUSES)[number];
export const DILIGENCE_STATUS_LABEL = labels(DILIGENCE_STATUSES);

// ---------------------------------------------------------------------------
// Rows as the query layer returns them
// ---------------------------------------------------------------------------

export interface TractionEntry {
  metric: string;
  value: string;
  period: string | null;
  source: string;
  provenance: Provenance;
}

export interface FundingProfile {
  id: string;
  company: { geography?: string; founded?: string; team?: string; summary?: string };
  product: { problem?: string; differentiation?: string; evidence?: string };
  market: { targetMarket?: string; geography?: string; segmentation?: string; evidence?: string };
  traction: TractionEntry[];
  businessModel: { pricing?: string; revenueModel?: string; contractModel?: string; recurring?: string };
  objective: { targetAmount?: number | null; currency?: string | null; instrument?: string; useOfFunds?: string; targetClose?: string };
  updatedAt: string;
}

export interface FundingRound {
  id: string;
  name: string;
  roundType: RoundType;
  status: RoundStatus;
  isPrimary: boolean;
  targetAmount: number | null;
  minimumAmount: number | null;
  maximumAmount: number | null;
  currency: string | null;
  instrument: string | null;
  preMoneyValuation: number | null;
  postMoneyValuation: number | null;
  targetCloseDate: string | null;
  actualCloseDate: string | null;
  openedAt: string | null;
  useOfFunds: string | null;
  notes: string | null;
  createdAt: string;
}

export interface InvestorContact {
  id: string;
  name: string;
  jobTitle: string | null;
  email: string | null;
  linkedinUrl: string | null;
  isPrimary: boolean;
}

export interface Investor {
  id: string;
  partyId: string;
  name: string;
  email: string | null;
  investorType: InvestorType;
  website: string | null;
  geographies: string[];
  stages: string[];
  sectors: string[];
  checkMin: number | null;
  checkMax: number | null;
  currency: string | null;
  source: InvestorSource;
  sourceNote: string | null;
  notes: string | null;
  status: "active" | "archived";
  researchStatus: "not_researched" | "researching" | "researched";
  lastResearchedAt: string | null;
  createdAt: string;
}

export interface ResearchFinding {
  id: string;
  investorId: string;
  field: ResearchField;
  content: string;
  provenance: Provenance;
  sourceUrl: string | null;
  sourceTitle: string | null;
  observedAt: string;
}

export interface PipelineRecord {
  id: string;
  investorId: string;
  investorName: string;
  roundId: string;
  stage: PipelineStage;
  previousStage: PipelineStage | null;
  stageEnteredAt: string;
  nextAction: string | null;
  nextActionDue: string | null;
  fitSummary: string | null;
  notes: string | null;
  committedAmount: number | null;
  investedAmount: number | null;
  currency: string | null;
  passReason: string | null;
  lastInteractionAt: string | null;
}

export interface StageChange {
  pipelineId: string;
  fromStage: PipelineStage | null;
  toStage: PipelineStage;
  changedAt: string;
}

export interface Interaction {
  id: string;
  investorId: string;
  investorName: string | null;
  contactId: string | null;
  roundId: string | null;
  interactionType: InteractionType;
  occurredAt: string;
  subject: string | null;
  notes: string | null;
  outcome: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
  source: "manual" | "outreach" | "import";
}

export interface OutreachDraft {
  id: string;
  investorId: string;
  investorName: string | null;
  contactId: string | null;
  roundId: string | null;
  subject: string;
  body: string;
  personalizationNotes: string | null;
  cta: string | null;
  status: OutreachStatus;
  origin: "user" | "ai_draft";
  approvedAt: string | null;
  recipientEmail: string | null;
  sentAt: string | null;
  providerMessageId: string | null;
  failureReason: string | null;
  updatedAt: string;
}

export interface ReadinessEvidence {
  note?: string;
  url?: string;
  dataRoomItemId?: string;
}

export interface ReadinessItem {
  id: string;
  category: ReadinessCategory;
  title: string;
  description: string | null;
  status: ReadinessStatus;
  evidence: ReadinessEvidence[];
  missingInformation: string | null;
  recommendedAction: string | null;
  dueAt: string | null;
  lastReviewedAt: string | null;
  updatedAt: string;
}

export interface DataRoomItem {
  id: string;
  roundId: string | null;
  name: string;
  category: DataRoomCategory;
  attachmentId: string | null;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  storageBucket: string | null;
  storagePath: string | null;
  status: DataRoomStatus;
  description: string | null;
  version: number;
  supersedesId: string | null;
  isCurrent: boolean;
  sensitivity: Sensitivity;
  expiresAt: string | null;
  updatedAt: string;
}

export interface DataRoomShare {
  id: string;
  dataRoomItemId: string;
  investorId: string | null;
  investorName: string | null;
  recipientEmail: string | null;
  permission: "view" | "download";
  sharedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  accessCount: number;
  lastAccessedAt: string | null;
}

export interface DiligenceItem {
  id: string;
  investorId: string | null;
  investorName: string | null;
  roundId: string | null;
  request: string;
  requester: string | null;
  dueAt: string | null;
  status: DiligenceStatus;
  response: string | null;
  notes: string | null;
  dataRoomItemIds: string[];
  decidedAt: string | null;
  updatedAt: string;
}
