import { describe, expect, it } from "vitest";
import { exportDedupeKey } from "./jobs";

// EXP-PLAT-06: "no duplicate jobs on double click" rests on this key being the same for
// the same request, however its filters happen to be ordered.
describe("exportDedupeKey", () => {
  it("is identical for the same export regardless of filter order", () => {
    expect(exportDedupeKey("crm.leads", "csv", "all", { a: "1", b: "2" })).toBe(
      exportDedupeKey("crm.leads", "csv", "all", { b: "2", a: "1" }),
    );
  });

  it("differs when anything that changes the file differs", () => {
    const base = exportDedupeKey("crm.leads", "csv", "all", { a: "1" });
    expect(exportDedupeKey("crm.leads", "xlsx", "all", { a: "1" })).not.toBe(base);
    expect(exportDedupeKey("crm.leads", "csv", "view", { a: "1" })).not.toBe(base);
    expect(exportDedupeKey("crm.leads", "csv", "all", { a: "2" })).not.toBe(base);
    expect(exportDedupeKey("crm.opportunities", "csv", "all", { a: "1" })).not.toBe(base);
  });
});
