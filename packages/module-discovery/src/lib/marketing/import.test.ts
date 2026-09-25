/** MKT-06. CSV imports keep unreported cells null and report bad rows by line. */
import { describe, expect, it } from "vitest";
import { parseMetricsCsv } from "./import";

describe("parseMetricsCsv", () => {
  it("maps common headers, tags rows as imported and keeps blanks as unreported", () => {
    const { rows, errors } = parseMetricsCsv("Date,Clicks,Leads,Cost,Currency\n2026-09-01,120,,500,INR\n2026-09-02,80,3,,\n");
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ metricDate: "2026-09-01", clicks: 120, leads: null, spend: 500, currency: "INR", source: "import" });
    expect(rows[1]).toMatchObject({ leads: 3, spend: null });
  });

  it("reports bad and duplicate rows by line and keeps the good ones", () => {
    const { rows, errors } = parseMetricsCsv("date,leads\n2026-09-01,4\n2026-09-01,5\nnot-a-date,1\n2026-09-03,-2\n");
    expect(rows).toHaveLength(1);
    expect(errors.map((e) => e.split(":")[0])).toEqual(["Line 3", "Line 4", "Line 5"]);
  });

  it("needs a date column", () => {
    expect(parseMetricsCsv("clicks\n4").errors[0]).toMatch(/date/);
  });

  it("requires a currency for money columns, as a hand entry would", () => {
    expect(parseMetricsCsv("date,spend\n2026-09-01,100").errors[0]).toMatch(/currency/);
  });
});
