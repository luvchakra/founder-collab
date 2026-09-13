import { describe, expect, it } from "vitest";
import { computeOfferingPortfolioRows } from "./portfolio";
import type { OpportunitySummary } from "./types";

describe("computeOfferingPortfolioRows", () => {
  it("counts hot and new opportunities per offering and reads conversations from the given map", () => {
    const offerings = [
      { productId: "iam", productName: "Managed IAM", workspaceId: "w1" },
      { productId: "training", productName: "IAM Training", workspaceId: "w2" },
    ];
    const opportunities: OpportunitySummary[] = [
      { workspace_id: "w1", prospect_id: "p1", status: "new", score: 91, priority: "high" }, // hot (priority high)
      { workspace_id: "w1", prospect_id: "p2", status: "new", score: 40, priority: "low" }, // new
      { workspace_id: "w1", prospect_id: "p3", status: "dismissed", score: 99, priority: "high" }, // resolved, no bin
      { workspace_id: "w2", prospect_id: "p4", status: "new", score: 20, priority: "low" }, // new
    ];

    const rows = computeOfferingPortfolioRows(offerings, opportunities, { w1: 5, w2: 2 });

    expect(rows).toEqual([
      { productId: "iam", productName: "Managed IAM", workspaceId: "w1", hotCount: 1, newCount: 1, conversationCount: 5 },
      { productId: "training", productName: "IAM Training", workspaceId: "w2", hotCount: 0, newCount: 1, conversationCount: 2 },
    ]);
  });

  it("reports zero for an offering with no opportunities or conversations at all", () => {
    const offerings = [{ productId: "fresh", productName: "Fresh Offering", workspaceId: "w9" }];
    const rows = computeOfferingPortfolioRows(offerings, [], {});
    expect(rows).toEqual([{ productId: "fresh", productName: "Fresh Offering", workspaceId: "w9", hotCount: 0, newCount: 0, conversationCount: 0 }]);
  });
});
