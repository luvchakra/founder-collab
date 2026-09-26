import { describe, expect, it } from "vitest";
import { exportFilename, slugPart } from "./filename";

// §13's naming standard.
describe("exportFilename", () => {
  it("follows wonderark_<module>_<resource>_<yyyy-mm-dd>.<ext>", () => {
    expect(exportFilename("crm", "leads", "csv", new Date("2026-09-26T05:00:00Z"), "Asia/Kolkata")).toBe(
      "wonderark_crm_leads_2026-09-26.csv",
    );
  });

  it("uses the business's local date", () => {
    // 20:30 UTC on the 25th is already the 26th in Kolkata.
    expect(exportFilename("finance", "Profit & Loss", "xlsx", new Date("2026-09-25T20:30:00Z"), "Asia/Kolkata")).toBe(
      "wonderark_finance_profit-and-loss_2026-09-26.xlsx",
    );
  });

  it("slugs anything that isn't a plain word", () => {
    expect(slugPart("  Sales / Returns!  ")).toBe("sales-returns");
    expect(slugPart("***")).toBe("export");
  });
});
