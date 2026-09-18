/**
 * R6's bulk runners. Three rules make this more than a loop: only prospects actually at
 * the eligible stage are attempted (re-running a finished step wastes a paid call), a hit
 * usage ceiling stops the batch rather than firing every remaining call, and any other
 * single failure does not abort the rest.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  researchProspect: vi.fn(),
  scoreProspect: vi.fn(),
  listProspects: vi.fn(),
}));

vi.mock("../ai/research-prospect", () => ({ researchProspect: h.researchProspect }));
vi.mock("../scoring/score-prospect", () => ({ scoreProspect: h.scoreProspect }));
vi.mock("./queries", () => ({ listProspects: h.listProspects }));

const { UsageLimitExceededError } = await import("../usage/limits");
const { bulkResearchProspects, bulkScoreProspects } = await import("./bulk-actions");

const WORKSPACE = "w1";

function prospects(...rows: { id: string; stage: string }[]) {
  h.listProspects.mockResolvedValue(rows);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.researchProspect.mockResolvedValue(undefined);
  h.scoreProspect.mockResolvedValue(undefined);
});

describe("bulkResearchProspects", () => {
  it("researches only the selected prospects still at the 'new' stage", async () => {
    prospects({ id: "p1", stage: "new" }, { id: "p2", stage: "researched" }, { id: "p3", stage: "new" });

    const result = await bulkResearchProspects(WORKSPACE, ["p1", "p2", "p3"]);

    expect(h.researchProspect).toHaveBeenCalledTimes(2);
    expect(h.researchProspect).toHaveBeenCalledWith("p1");
    expect(h.researchProspect).toHaveBeenCalledWith("p3");
    expect(result).toEqual({ completed: 2, skipped: 1, limitReached: false });
  });

  it("ignores prospects that were not selected, even if eligible", async () => {
    prospects({ id: "p1", stage: "new" }, { id: "other", stage: "new" });

    await bulkResearchProspects(WORKSPACE, ["p1"]);

    expect(h.researchProspect).toHaveBeenCalledTimes(1);
    expect(h.researchProspect).toHaveBeenCalledWith("p1");
  });

  it("counts everything selected but not completed as skipped", async () => {
    prospects({ id: "p1", stage: "researched" }, { id: "p2", stage: "sent" });

    await expect(bulkResearchProspects(WORKSPACE, ["p1", "p2"])).resolves.toEqual({
      completed: 0,
      skipped: 2,
      limitReached: false,
    });
  });

  it("stops the batch as soon as the usage ceiling is hit", async () => {
    prospects({ id: "p1", stage: "new" }, { id: "p2", stage: "new" }, { id: "p3", stage: "new" });
    h.researchProspect
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new UsageLimitExceededError("runs"));

    const result = await bulkResearchProspects(WORKSPACE, ["p1", "p2", "p3"]);

    expect(h.researchProspect).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ completed: 1, skipped: 2, limitReached: true });
  });

  it("keeps going after a single prospect fails for any other reason", async () => {
    prospects({ id: "p1", stage: "new" }, { id: "p2", stage: "new" }, { id: "p3", stage: "new" });
    h.researchProspect.mockRejectedValueOnce(new Error("provider hiccup"));

    const result = await bulkResearchProspects(WORKSPACE, ["p1", "p2", "p3"]);

    expect(h.researchProspect).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ completed: 2, skipped: 1, limitReached: false });
  });

  it("runs sequentially, so the ceiling check inside each call can stop the rest", async () => {
    prospects({ id: "p1", stage: "new" }, { id: "p2", stage: "new" });
    const order: string[] = [];
    h.researchProspect.mockImplementation(async (id: string) => {
      order.push(`start:${id}`);
      await Promise.resolve();
      order.push(`end:${id}`);
    });

    await bulkResearchProspects(WORKSPACE, ["p1", "p2"]);

    expect(order).toEqual(["start:p1", "end:p1", "start:p2", "end:p2"]);
  });

  it("does nothing for an empty selection", async () => {
    prospects({ id: "p1", stage: "new" });

    await expect(bulkResearchProspects(WORKSPACE, [])).resolves.toEqual({
      completed: 0,
      skipped: 0,
      limitReached: false,
    });
    expect(h.researchProspect).not.toHaveBeenCalled();
  });
});

describe("bulkScoreProspects", () => {
  it("scores only the selected prospects at the 'researched' stage", async () => {
    prospects({ id: "p1", stage: "researched" }, { id: "p2", stage: "new" });

    const result = await bulkScoreProspects(WORKSPACE, ["p1", "p2"]);

    expect(h.scoreProspect).toHaveBeenCalledTimes(1);
    expect(h.scoreProspect).toHaveBeenCalledWith("p1");
    expect(result).toEqual({ completed: 1, skipped: 1, limitReached: false });
  });

  it("never calls the research action", async () => {
    prospects({ id: "p1", stage: "researched" });

    await bulkScoreProspects(WORKSPACE, ["p1"]);

    expect(h.researchProspect).not.toHaveBeenCalled();
  });

  it("propagates a failed prospect listing", async () => {
    h.listProspects.mockRejectedValue(new Error("denied"));

    await expect(bulkScoreProspects(WORKSPACE, ["p1"])).rejects.toThrow("denied");
  });
});
