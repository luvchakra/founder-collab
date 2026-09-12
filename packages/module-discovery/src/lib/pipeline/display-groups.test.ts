import { describe, expect, it } from "vitest";
import { computeDisplayGroups, downstreamGroupLabels, PIPELINE_DISPLAY_GROUPS } from "./display-groups";
import { PIPELINE_STAGE_KEYS, type PipelineStage, type PipelineStageKey, type PipelineStageStatus } from "./types";

function stagesWith(overrides: Partial<Record<PipelineStageKey, PipelineStageStatus>>): PipelineStage[] {
  return PIPELINE_STAGE_KEYS.map((stage_key) => ({
    id: stage_key,
    workspace_id: "w1",
    stage_key,
    status: overrides[stage_key] ?? "not_started",
    started_at: null,
    completed_at: null,
    failed_at: null,
    error: null,
    last_ai_run_id: null,
    version: 0,
    input_version: null,
    output_version: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  }));
}

describe("computeDisplayGroups", () => {
  it("covers every technical stage key exactly once across all nine groups", () => {
    const covered = PIPELINE_DISPLAY_GROUPS.flatMap((g) => g.stageKeys);
    expect(new Set(covered).size).toBe(PIPELINE_STAGE_KEYS.length);
    expect(covered.length).toBe(PIPELINE_STAGE_KEYS.length);
  });

  it("marks the first group current and every other group upcoming when nothing has run", () => {
    const groups = computeDisplayGroups(stagesWith({}));
    expect(groups[0]).toMatchObject({ key: "website_understanding", status: "current", activeStageKey: "website_understanding" });
    expect(groups.slice(1).every((g) => g.status === "upcoming")).toBe(true);
  });

  it("marks earlier groups completed and the in-progress group current", () => {
    const groups = computeDisplayGroups(
      stagesWith({
        website_understanding: "completed",
        offering_profile: "completed",
        icp: "completed",
        buyer_personas: "completed",
        discovery_strategy: "completed",
        account_discovery: "completed",
        signals: "running",
      }),
    );
    expect(groups.filter((g) => g.status === "completed").map((g) => g.key)).toEqual([
      "website_understanding",
      "offering_profile",
      "icp",
      "buyer_personas",
      "discovery_strategy",
    ]);
    expect(groups.find((g) => g.key === "signal_intelligence")).toMatchObject({ status: "current", activeStageKey: "signals" });
    expect(groups.filter((g) => g.status === "current")).toHaveLength(1);
  });

  it("reports a group as failed when any of its underlying stages failed, even mid-group", () => {
    const groups = computeDisplayGroups(
      stagesWith({
        website_understanding: "completed",
        offering_profile: "completed",
        icp: "completed",
        buyer_personas: "completed",
        discovery_strategy: "completed",
        account_discovery: "completed",
        signals: "failed",
      }),
    );
    const signalIntelligence = groups.find((g) => g.key === "signal_intelligence");
    expect(signalIntelligence).toMatchObject({ status: "failed", activeStageKey: "signals" });
    expect(groups.filter((g) => g.status === "current")).toHaveLength(0);
  });

  it("treats skipped exactly like completed for group-done purposes", () => {
    const groups = computeDisplayGroups(
      stagesWith({
        website_understanding: "completed",
        offering_profile: "completed",
        icp: "completed",
        buyer_personas: "completed",
        discovery_strategy: "completed",
        account_discovery: "skipped",
        signals: "skipped",
        signal_correlation: "skipped",
      }),
    );
    expect(groups.find((g) => g.key === "signal_intelligence")).toMatchObject({ status: "completed" });
  });

  it("marks every group completed once the whole pipeline is done", () => {
    const allCompleted = Object.fromEntries(PIPELINE_STAGE_KEYS.map((k) => [k, "completed" as const]));
    const groups = computeDisplayGroups(stagesWith(allCompleted));
    expect(groups.every((g) => g.status === "completed")).toBe(true);
  });
});

describe("downstreamGroupLabels", () => {
  it("names every founder-facing group downstream of ICP, deduped, without the ICP group itself", () => {
    const labels = downstreamGroupLabels("icp");
    expect(labels).toEqual([
      "Buyer Personas",
      "Discovery Strategy",
      "Signal Intelligence",
      "Opportunity Scoring",
      "Research",
      "Recommended Action",
    ]);
  });

  it("returns nothing for the very last stage", () => {
    expect(downstreamGroupLabels("crm_handoff")).toEqual([]);
  });
});
