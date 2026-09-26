import { describe, expect, it } from "vitest";
import { computeOfferingPerformanceAnalysis, computeRateBuckets, computeScoreOutcomeBuckets } from "./analysis";

describe("computeRateBuckets", () => {
  it("groups by key and computes a rounded rate", () => {
    const items = [
      { group: "Retail", hit: true },
      { group: "Retail", hit: false },
      { group: "Healthcare", hit: true },
    ];
    const buckets = computeRateBuckets(items, (i) => i.group, (i) => i.hit);
    expect(buckets).toEqual([
      { label: "Healthcare", total: 1, matched: 1, rate: 100 },
      { label: "Retail", total: 2, matched: 1, rate: 50 },
    ]);
  });

  it("skips null and blank group keys rather than folding them into an unknown bucket", () => {
    const items = [
      { group: null, hit: true },
      { group: "  ", hit: true },
      { group: "Finance", hit: true },
    ];
    const buckets = computeRateBuckets(items, (i) => i.group, (i) => i.hit);
    expect(buckets).toEqual([{ label: "Finance", total: 1, matched: 1, rate: 100 }]);
  });

  it("sorts highest rate first, ties broken by total", () => {
    const items = [
      { group: "A", hit: true },
      { group: "B", hit: true },
      { group: "B", hit: true },
    ];
    const buckets = computeRateBuckets(items, (i) => i.group, (i) => i.hit);
    expect(buckets.map((b) => b.label)).toEqual(["B", "A"]);
  });
});

describe("computeScoreOutcomeBuckets", () => {
  it("buckets by fixed score ranges and reports the won rate within each", () => {
    const buckets = computeScoreOutcomeBuckets([
      { score: 10, won: false },
      { score: 30, won: true },
      { score: 90, won: true },
      { score: 95, won: false },
    ]);
    expect(buckets).toEqual([
      { label: "0-25", total: 1, matched: 0, rate: 0 },
      { label: "26-50", total: 1, matched: 1, rate: 100 },
      { label: "51-75", total: 0, matched: 0, rate: 0 },
      { label: "76-100", total: 2, matched: 1, rate: 50 },
    ]);
  });

  it("excludes null scores from every range rather than guessing a bucket", () => {
    const buckets = computeScoreOutcomeBuckets([{ score: null, won: true }]);
    expect(buckets.every((b) => b.total === 0)).toBe(true);
  });
});

describe("computeOfferingPerformanceAnalysis", () => {
  it("assembles all four answerable questions from raw rows", () => {
    const result = computeOfferingPerformanceAnalysis({
      prospects: [
        { id: "p1", industry: "Retail", location: "Toronto", fit_score: 80, outcome: "won" },
        { id: "p2", industry: "Retail", location: "Berlin", fit_score: 20, outcome: "lost" },
      ],
      signals: [
        { prospect_id: "p1", description: "Recently funded" },
        { prospect_id: "p2", description: "Recently funded" },
      ],
      conversations: [{ prospect_id: "p1", contact_id: "c1", status: "replied" }],
      contacts: [{ id: "c1", job_title: "VP Engineering" }],
    });

    expect(result.signalsProducingConversations).toEqual([{ label: "Recently funded", total: 2, matched: 1, rate: 50 }]);
    expect(result.industryConversionRates).toEqual([{ label: "Retail", total: 2, matched: 1, rate: 50 }]);
    expect(result.locationConversionRates).toEqual([
      { label: "Toronto", total: 1, matched: 1, rate: 100 },
      { label: "Berlin", total: 1, matched: 0, rate: 0 },
    ]);
    expect(result.buyerRolesThatRespond).toEqual([{ label: "VP Engineering", total: 1, matched: 1, rate: 100 }]);
    expect(result.scoreVsOutcome.find((b) => b.label === "76-100")).toEqual({ label: "76-100", total: 1, matched: 1, rate: 100 });
  });

  it("excludes conversations with no linked contact from the buyer-role breakdown", () => {
    const result = computeOfferingPerformanceAnalysis({
      prospects: [],
      signals: [],
      conversations: [{ prospect_id: "p1", contact_id: null, status: "replied" }],
      contacts: [],
    });
    expect(result.buyerRolesThatRespond).toEqual([]);
  });
});
