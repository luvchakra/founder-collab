import type { FundingRound, Investor, PipelineRecord } from "../../lib/funding/types";

/**
 * EXP-FND-01..10 -- Funding fixtures for the export adapter tests (the generic helpers --
 * context, params, sheet readers -- are shared with Marketing in ../marketing/test-support).
 * Not imported by any adapter.
 */
export {
  BUSINESS_ID,
  OTHER_BUSINESS_ID,
  allCellText,
  exportContext,
  headers,
  params,
  renderText,
  rowValues,
  sheet,
} from "../marketing/test-support";

export const ROUND_ID = "77777777-7777-4777-8777-777777777777";
export const INVESTOR_ID = "88888888-8888-4888-8888-888888888888";

export function round(overrides: Partial<FundingRound> = {}): FundingRound {
  return {
    id: ROUND_ID,
    name: "Seed 2026",
    roundType: "seed",
    status: "open",
    isPrimary: true,
    targetAmount: 10_000_000,
    minimumAmount: null,
    maximumAmount: null,
    currency: "INR",
    instrument: "Equity",
    preMoneyValuation: null,
    postMoneyValuation: null,
    targetCloseDate: "2026-12-31",
    actualCloseDate: null,
    openedAt: "2026-09-01T00:00:00Z",
    useOfFunds: "Hiring",
    notes: null,
    createdAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

export function investor(overrides: Partial<Investor> = {}): Investor {
  return {
    id: INVESTOR_ID,
    partyId: "party-1",
    name: "Blue Fund",
    email: "deals@bluefund.example",
    investorType: "vc",
    website: "https://bluefund.example",
    geographies: ["India", "SEA"],
    stages: ["seed"],
    sectors: ["fintech"],
    checkMin: 2_000_000,
    checkMax: null,
    currency: "INR",
    source: "founder_network",
    sourceNote: null,
    notes: null,
    status: "active",
    researchStatus: "not_researched",
    lastResearchedAt: null,
    createdAt: "2026-08-10T00:00:00Z",
    ...overrides,
  };
}

export function pipelineRecord(overrides: Partial<PipelineRecord> = {}): PipelineRecord {
  return {
    id: "pl-1",
    investorId: INVESTOR_ID,
    investorName: "Blue Fund",
    roundId: ROUND_ID,
    stage: "meeting",
    previousStage: "contacted",
    stageEnteredAt: "2026-09-20T00:00:00Z",
    nextAction: "Send deck",
    nextActionDue: "2026-09-30",
    fitSummary: null,
    notes: null,
    committedAmount: null,
    investedAmount: null,
    currency: "INR",
    passReason: null,
    lastInteractionAt: null,
    ...overrides,
  };
}
