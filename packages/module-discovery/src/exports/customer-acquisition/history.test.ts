// EXP-DISC-12 -- Discovery History (pipeline runs) export.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineRun } from "../../lib/pipeline/types";
import { FOREIGN_WORKSPACE_ID, OTHER_BUSINESS_ID, WORKSPACE_ID, headersOf, makeContext, makeProduct, makeWorkspace, rowsOf, tamperedParams } from "./test-support";

const h = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  listPipelineRuns: vi.fn(),
  listPipelineRunsForExport: vi.fn(),
}));
vi.mock("../../lib/tenancy/queries", () => ({ getProduct: h.getProduct, getWorkspaceForProduct: h.getWorkspaceForProduct }));
vi.mock("../../lib/pipeline/queries", () => ({ listPipelineRuns: h.listPipelineRuns }));
vi.mock("./queries", () => ({ listPipelineRunsForExport: h.listPipelineRunsForExport }));

const { discoveryHistoryExport: adapter } = await import("./history");

const runs: PipelineRun[] = [
  { id: "run-2", workspace_id: WORKSPACE_ID, trigger: "retry_failed_stage", starting_stage: "research", status: "running", started_at: "2026-09-20T10:00:00Z", completed_at: null, error: null, created_at: "" },
  { id: "run-1", workspace_id: WORKSPACE_ID, trigger: "run_ai_discovery_cta", starting_stage: "website_understanding", status: "failed", started_at: "2026-09-19T10:00:00Z", completed_at: "2026-09-19T10:01:30Z", error: "Rate limited", created_at: "" },
];

beforeEach(() => {
  vi.clearAllMocks();
  h.getProduct.mockResolvedValue(makeProduct());
  h.getWorkspaceForProduct.mockResolvedValue(makeWorkspace());
  h.listPipelineRuns.mockResolvedValue(runs);
  h.listPipelineRunsForExport.mockResolvedValue(runs);
});

describe("discovery.history (EXP-DISC-12)", () => {
  it("is the Discovery-licensed run history export", () => {
    expect(adapter.id).toBe("discovery.history");
    expect(adapter.module).toBe("discovery");
    expect(adapter.permissions).toEqual([]);
  });

  it("current view is the page's own latest-50 query; all matching pages through every run", async () => {
    const filters = adapter.parseFilters!(tamperedParams());
    await adapter.load(makeContext({ scope: "view" }), filters);
    expect(h.listPipelineRuns).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(h.listPipelineRunsForExport).not.toHaveBeenCalled();

    await adapter.load(makeContext({ scope: "all" }), filters);
    expect(h.listPipelineRunsForExport).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(JSON.stringify([h.listPipelineRuns.mock.calls, h.listPipelineRunsForExport.mock.calls])).not.toContain(FOREIGN_WORKSPACE_ID);
  });

  it("refuses an offering from another business", async () => {
    h.getProduct.mockResolvedValue(makeProduct({ business_id: OTHER_BUSINESS_ID }));
    await expect(adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()))).rejects.toMatchObject({ status: 404 });
  });

  it("labels trigger, stage and status; an unfinished run has a blank end and duration", async () => {
    const workbook = await adapter.load(makeContext(), adapter.parseFilters!(tamperedParams()));
    expect(headersOf(workbook, "Runs")).toEqual(["Run ID", "Started", "Ended", "Status", "Trigger", "Starting stage", "Duration (seconds)", "Result summary", "Error"]);
    const [running, failed] = rowsOf(workbook, "Runs");
    expect(running).toMatchObject({ Status: "Running", Trigger: "Retry failed stage", "Starting stage": "Research Top Opportunities", Ended: null, "Duration (seconds)": null, "Result summary": "In progress" });
    expect(failed).toMatchObject({ "Run ID": "run-1", Status: "Failed", "Starting stage": "Research Website", "Duration (seconds)": 90, "Result summary": "Stopped: Rate limited" });
  });
});
