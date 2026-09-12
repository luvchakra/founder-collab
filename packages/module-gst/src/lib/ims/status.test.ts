import { describe, expect, it } from "vitest";
import { effectiveImsStatus } from "./status";
import type { ImsAction } from "./types";

function action(overrides: Partial<ImsAction>): ImsAction {
  return {
    id: "ims-1",
    businessId: "biz-1",
    gstr2bDocumentId: "doc-1",
    action: "accepted",
    remarks: null,
    actionHistory: [],
    actedBy: "user-1",
    actedAt: "2026-09-12T00:00:00Z",
    createdAt: "2026-09-12T00:00:00Z",
    updatedAt: "2026-09-12T00:00:00Z",
    ...overrides,
  };
}

describe("effectiveImsStatus", () => {
  it("returns 'no_action' for null -- never silently relabeled as accepted", () => {
    expect(effectiveImsStatus(null)).toBe("no_action");
  });

  it("passes through an explicit accepted action", () => {
    expect(effectiveImsStatus(action({ action: "accepted" }))).toBe("accepted");
  });

  it("passes through an explicit rejected action", () => {
    expect(effectiveImsStatus(action({ action: "rejected" }))).toBe("rejected");
  });

  it("passes through an explicit pending action", () => {
    expect(effectiveImsStatus(action({ action: "pending" }))).toBe("pending");
  });
});
