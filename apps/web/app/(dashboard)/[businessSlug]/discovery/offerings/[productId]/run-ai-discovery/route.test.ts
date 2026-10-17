/**
 * DISC-AI-APPROVAL-01: the Run AI Discovery route reads the business's AI approval mode
 * itself -- a request body naming a mode is ignored -- and a stage that stops for
 * approval closes the run as `awaiting_approval`, not completed or failed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  resolveBusinessIdBySlug: vi.fn(),
  getProduct: vi.fn(),
  getWorkspaceForProduct: vi.fn(),
  getAiApprovalMode: vi.fn(),
  runIcpStage: vi.fn(),
  getPipelineRun: vi.fn(),
  markPipelineStageRunning: vi.fn(),
  markPipelineStageCompleted: vi.fn(),
  markPipelineStageFailed: vi.fn(),
  markPipelineStageSkipped: vi.fn(),
  completePipelineRun: vi.fn(),
}));

vi.mock("@cofounderai/core/businesses/resolve", () => ({ resolveBusinessIdBySlug: h.resolveBusinessIdBySlug }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/queries", () => ({ getProduct: h.getProduct, getWorkspaceForProduct: h.getWorkspaceForProduct }));
vi.mock("@cofounderai/module-discovery/lib/ai-approval/queries", () => ({ getAiApprovalMode: h.getAiApprovalMode }));
vi.mock("@cofounderai/module-discovery/lib/pipeline/queries", () => ({ listPipelineStages: vi.fn(), getPipelineRun: h.getPipelineRun }));
vi.mock("@cofounderai/module-discovery/lib/pipeline/mutations", () => ({
  markPipelineStageRunning: h.markPipelineStageRunning,
  markPipelineStageCompleted: h.markPipelineStageCompleted,
  markPipelineStageFailed: h.markPipelineStageFailed,
  markPipelineStageSkipped: h.markPipelineStageSkipped,
  startPipelineRun: vi.fn(),
  completePipelineRun: h.completePipelineRun,
}));
vi.mock("@cofounderai/module-discovery/lib/pipeline/handlers", () => ({
  runWebsiteUnderstandingStage: vi.fn(),
  runOfferingProfileStage: vi.fn(),
  runIcpStage: h.runIcpStage,
  runBuyerPersonasStage: vi.fn(),
  runDiscoveryStrategyStage: vi.fn(),
  runAccountDiscoveryStage: vi.fn(),
  runSignalsStage: vi.fn(),
  runSignalCorrelationStage: vi.fn(),
  runOpportunityScoringStage: vi.fn(),
  runWhyNowStage: vi.fn(),
  runResearchStage: vi.fn(),
  runBuyerIntelligenceStage: vi.fn(),
  runRecommendedActionStage: vi.fn(),
  requireActiveDefinition: vi.fn(),
  activeOpportunities: vi.fn(),
}));
vi.mock("@cofounderai/module-discovery/lib/opportunities/handoff", () => ({ computeHandoffStatus: vi.fn() }));
vi.mock("@cofounderai/module-crm/contract/index", () => ({ getDiscoveryHandoffLead: vi.fn() }));

const { POST } = await import("./route");

function post(body: unknown) {
  return POST(new Request("https://example.com/x", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ businessSlug: "acme", productId: "p1" }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.resolveBusinessIdBySlug.mockResolvedValue("b1");
  h.getProduct.mockResolvedValue({ id: "p1", business_id: "b1" });
  h.getWorkspaceForProduct.mockResolvedValue({ id: "w1" });
  h.getPipelineRun.mockResolvedValue({ id: "run1" });
  h.markPipelineStageCompleted.mockResolvedValue({ stage_key: "icp", status: "needs_review" });
  h.markPipelineStageFailed.mockResolvedValue({ stage_key: "icp", status: "failed" });
});

describe("POST run-ai-discovery (DISC-AI-APPROVAL-01)", () => {
  it("uses the business's saved mode, ignoring a mode in the request body", async () => {
    h.getAiApprovalMode.mockResolvedValue("review");
    h.runIcpStage.mockResolvedValue({ outcome: "completed", detail: "draft", reviewLevel: "needs_review", awaitingApproval: true });

    const response = await post({ stageKey: "icp", runId: "run1", aiApprovalMode: "auto" });

    expect(h.getAiApprovalMode).toHaveBeenCalledWith("b1");
    expect(h.runIcpStage).toHaveBeenCalledWith({ workspaceId: "w1", productId: "p1", aiApprovalMode: "review" });
    expect(h.completePipelineRun).toHaveBeenCalledWith("w1", "run1", "awaiting_approval", null);
    await expect(response.json()).resolves.toMatchObject({ ok: true, awaitingApproval: true });
  });

  it("auto mode passes through and leaves the run open between stages", async () => {
    h.getAiApprovalMode.mockResolvedValue("auto");
    h.runIcpStage.mockResolvedValue({ outcome: "completed", detail: "ICP ready" });

    const response = await post({ stageKey: "icp", runId: "run1" });

    expect(h.runIcpStage).toHaveBeenCalledWith({ workspaceId: "w1", productId: "p1", aiApprovalMode: "auto" });
    expect(h.completePipelineRun).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ ok: true, awaitingApproval: false });
  });

  it("a failed setting lookup fails the stage without running it", async () => {
    h.getAiApprovalMode.mockRejectedValue(new Error("lookup failed"));

    const response = await post({ stageKey: "icp", runId: "run1" });

    expect(h.runIcpStage).not.toHaveBeenCalled();
    expect(h.completePipelineRun).toHaveBeenCalledWith("w1", "run1", "failed", "lookup failed");
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: "lookup failed" });
  });
});
