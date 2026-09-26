import { describe, expect, it } from "vitest";
import { buildExportUrl } from "./export-menu";

// EXP-PLAT-04: the Export control forwards the page's own filters, and nothing it sends
// can override the parameters the server keys on.
describe("buildExportUrl", () => {
  it("carries the page's filters, the format and the scope", () => {
    const url = buildExportUrl("crm.leads", "acme", "csv", "all", { status: "open", owner: "me", q: "" });
    expect(url).toBe("/api/exports/crm.leads?status=open&owner=me&business=acme&format=csv&scope=all");
  });

  it("repeats multi-valued filters", () => {
    const url = buildExportUrl("inventory.stock", "acme", "xlsx", "view", { warehouse: ["w1", "w2"] });
    expect(url).toContain("warehouse=w1&warehouse=w2");
  });

  it("never lets a page param override business, format or scope", () => {
    const url = new URL(buildExportUrl("crm.leads", "acme", "csv", "view", { business: "other", format: "xlsx", scope: "all" }), "https://x");
    expect(url.searchParams.getAll("business")).toEqual(["acme"]);
    expect(url.searchParams.getAll("format")).toEqual(["csv"]);
    expect(url.searchParams.getAll("scope")).toEqual(["view"]);
  });
});
