/** FND-03/FND-16. The Funding attention rules are deterministic and carry their evidence. */
import { describe, expect, it } from "vitest";
import { fundingAttention } from "./attention";
import type { FundingRound, Investor, PipelineRecord } from "./types";

const NOW = new Date("2026-09-25T00:00:00Z");
const empty = { profile: null, round: null, investors: [], pipeline: [], outreach: [], readiness: [], dataRoom: [], diligence: [], financeAvailable: true, now: NOW };

const round: FundingRound = {
  id: "r1",
  name: "Seed",
  roundType: "seed",
  status: "open",
  isPrimary: true,
  targetAmount: null,
  minimumAmount: null,
  maximumAmount: null,
  currency: null,
  instrument: null,
  preMoneyValuation: null,
  postMoneyValuation: null,
  targetCloseDate: null,
  actualCloseDate: null,
  openedAt: null,
  useOfFunds: null,
  notes: null,
  createdAt: "",
};

const keys = (items: { key: string }[]) => items.map((i) => i.key);

describe("fundingAttention", () => {
  it("starts a new business at profile, round and checklist", () => {
    expect(keys(fundingAttention(empty))).toEqual(["profile", "no-round", "readiness-empty"]);
  });

  it("flags a round without a target as high severity", () => {
    const items = fundingAttention({ ...empty, round });
    expect(items[0]!.key).toBe("round-target");
  });

  it("says Finance is unavailable rather than inventing figures", () => {
    expect(keys(fundingAttention({ ...empty, financeAvailable: false }))).toContain("finance");
  });

  it("flags pipeline investors without current research, and overdue follow-ups", () => {
    const investor = { id: "i1", name: "Acme", researchStatus: "researched", lastResearchedAt: "2026-01-01T00:00:00Z" } as Investor;
    const record = {
      id: "p1",
      investorId: "i1",
      investorName: "Acme",
      stage: "contacted",
      nextAction: "Send deck",
      nextActionDue: "2026-09-20",
    } as PipelineRecord;
    const items = fundingAttention({ ...empty, investors: [investor], pipeline: [record] });
    expect(keys(items)).toEqual(expect.arrayContaining(["research", "next-actions"]));
  });
});
