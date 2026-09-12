import { describe, expect, it } from "vitest";
import { sortGovernmentResponses } from "./sort";
import type { GovernmentResponseRecord } from "./types";

function record(overrides: Partial<GovernmentResponseRecord> = {}): GovernmentResponseRecord {
  return {
    source: "einvoice",
    documentId: "doc-1",
    recordId: "rec-1",
    status: "generated",
    rawResponse: null,
    receivedAt: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("sortGovernmentResponses", () => {
  it("sorts newest first", () => {
    const older = record({ recordId: "a", receivedAt: "2026-09-01T00:00:00Z" });
    const newer = record({ recordId: "b", receivedAt: "2026-09-10T00:00:00Z" });
    expect(sortGovernmentResponses([older, newer]).map((r) => r.recordId)).toEqual(["b", "a"]);
  });

  it("does not mutate the input array", () => {
    const input = [record({ recordId: "a" }), record({ recordId: "b", receivedAt: "2026-09-10T00:00:00Z" })];
    const originalOrder = input.map((r) => r.recordId);
    sortGovernmentResponses(input);
    expect(input.map((r) => r.recordId)).toEqual(originalOrder);
  });

  it("handles an empty list", () => {
    expect(sortGovernmentResponses([])).toEqual([]);
  });
});
