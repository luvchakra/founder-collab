/**
 * FND-03/FND-14. Round progress never presents a commitment as cash, never shows a
 * negative remaining, and never adds currencies together; the funnel counts what was
 * reached, not only where records sit now.
 */
import { describe, expect, it } from "vitest";
import { dataRoomSummary, investorFunnel, readinessSummary, researchState, roundProgress, timeInStage } from "./metrics";

const round = { targetAmount: 1_000_000, currency: "INR" };

describe("roundProgress", () => {
  it("keeps committed and raised separate", () => {
    const p = roundProgress(round, [
      { stage: "committed", committedAmount: 300_000, investedAmount: null, currency: "INR" },
      { stage: "invested", committedAmount: 200_000, investedAmount: 200_000, currency: "INR" },
      { stage: "meeting", committedAmount: null, investedAmount: null, currency: null },
    ]);
    expect(p.committed.value).toBe(500_000);
    expect(p.raised.value).toBe(200_000);
    expect(p.remaining.value).toBe(800_000);
    expect(p.raised.kind).toBe("actual");
    expect(p.committed.kind).toBe("user_entered");
  });

  it("reports nothing raised as unavailable, not zero, but still shows remaining against the target", () => {
    const p = roundProgress(round, []);
    expect(p.raised.value).toBeNull();
    expect(p.committed.value).toBeNull();
    expect(p.remaining.value).toBe(1_000_000);
  });

  it("labels an oversubscribed round rather than showing a negative remaining", () => {
    const p = roundProgress(round, [{ stage: "invested", committedAmount: null, investedAmount: 1_200_000, currency: "INR" }]);
    expect(p.remaining.value).toBe(0);
    expect(p.aboveTarget).toBe(true);
  });

  it("leaves out amounts in another currency and says how many", () => {
    const p = roundProgress(round, [{ stage: "invested", committedAmount: null, investedAmount: 5000, currency: "USD" }]);
    expect(p.raised.value).toBeNull();
    expect(p.excludedForCurrency).toBe(1);
  });

  it("has no remaining without a target", () => {
    expect(roundProgress({ targetAmount: null, currency: null }, []).remaining.value).toBeNull();
  });
});

describe("investorFunnel", () => {
  it("counts an investor who met and then passed as having reached Meeting", () => {
    const f = investorFunnel(
      [
        { id: "a", stage: "passed" },
        { id: "b", stage: "contacted" },
      ],
      [
        { pipelineId: "a", fromStage: null, toStage: "identified", changedAt: "2026-09-01" },
        { pipelineId: "a", fromStage: "identified", toStage: "meeting", changedAt: "2026-09-02" },
        { pipelineId: "a", fromStage: "meeting", toStage: "passed", changedAt: "2026-09-03" },
      ],
    );
    const meeting = f.steps.find((s) => s.stage === "meeting")!;
    const contacted = f.steps.find((s) => s.stage === "contacted")!;
    expect(meeting.reached).toBe(1);
    expect(contacted.reached).toBe(2);
    expect(meeting.conversionFromPrevious).toBe(0.5);
    expect(f.passed).toBe(1);
  });
});

describe("timeInStage", () => {
  it("measures completed stays only", () => {
    const t = timeInStage([
      { pipelineId: "a", fromStage: null, toStage: "identified", changedAt: "2026-09-01T00:00:00Z" },
      { pipelineId: "a", fromStage: "identified", toStage: "contacted", changedAt: "2026-09-05T00:00:00Z" },
    ]);
    expect(t.identified).toBe(4);
    expect(t.contacted).toBeUndefined();
  });
});

describe("readinessSummary", () => {
  it("excludes not-applicable items from completion and counts overdue open items", () => {
    const s = readinessSummary(
      [
        { status: "ready", dueAt: "2026-01-01" },
        { status: "missing", dueAt: "2026-09-01" },
        { status: "not_applicable", dueAt: null },
      ],
      "2026-09-25",
    );
    expect(s.completion).toBe(0.5);
    expect(s.overdue).toBe(1);
  });

  it("has no completion with nothing applicable", () => {
    expect(readinessSummary([], "2026-09-25").completion).toBeNull();
  });
});

describe("dataRoomSummary", () => {
  it("counts only current versions and live shares", () => {
    const s = dataRoomSummary(
      [
        { status: "ready", isCurrent: true },
        { status: "shared", isCurrent: false },
        { status: "missing", isCurrent: true },
      ],
      [
        { revokedAt: null, expiresAt: "2026-12-01T00:00:00Z", accessCount: 2 },
        { revokedAt: "2026-09-01T00:00:00Z", expiresAt: "2026-12-01T00:00:00Z", accessCount: 1 },
      ],
      new Date("2026-09-25T00:00:00Z"),
    );
    expect(s).toMatchObject({ ready: 1, missing: 1, activeShares: 1, accessEvents: 3 });
  });
});

describe("researchState", () => {
  it("marks old research stale instead of presenting it as current", () => {
    const now = new Date("2026-09-25T00:00:00Z");
    expect(researchState({ researchStatus: "researched", lastResearchedAt: "2026-01-01T00:00:00Z" }, now)).toBe("stale");
    expect(researchState({ researchStatus: "researched", lastResearchedAt: "2026-09-01T00:00:00Z" }, now)).toBe("researched");
    expect(researchState({ researchStatus: "not_researched", lastResearchedAt: null }, now)).toBe("not_researched");
  });
});
