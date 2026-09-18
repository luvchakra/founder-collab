/**
 * CSV import is one of the three ways a prospect enters the pipeline, and the only one
 * where a founder pastes arbitrary text. The parser is hand-rolled (no dependency, per
 * CLAUDE.md principle #2), so quoting, header order and partial-failure behaviour are
 * pinned here — a silently dropped column or a row lost to a stray quote is the kind of
 * bug an import surfaces only as "some of my prospects are missing".
 */
import { describe, expect, it } from "vitest";
import { parseProspectsCsv } from "./csv";

describe("parseProspectsCsv", () => {
  it("parses a minimal single-column CSV", () => {
    const result = parseProspectsCsv("company_name\nAcme Ltd");

    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      {
        companyName: "Acme Ltd",
        website: undefined,
        industry: undefined,
        companySize: undefined,
        location: undefined,
        description: undefined,
      },
    ]);
  });

  it("maps every optional column onto its camelCase input field", () => {
    const csv = [
      "company_name,website,industry,company_size,location,description",
      "Acme Ltd,acme.com,Manufacturing,50-200,Pune,Makes widgets",
    ].join("\n");

    expect(parseProspectsCsv(csv).rows[0]).toEqual({
      companyName: "Acme Ltd",
      website: "acme.com",
      industry: "Manufacturing",
      companySize: "50-200",
      location: "Pune",
      description: "Makes widgets",
    });
  });

  it("reads columns by name, not position", () => {
    const csv = ["location,company_name,website", "Pune,Acme Ltd,acme.com"].join("\n");

    expect(parseProspectsCsv(csv).rows[0]).toMatchObject({
      companyName: "Acme Ltd",
      website: "acme.com",
      location: "Pune",
    });
  });

  it("accepts a header in any casing", () => {
    expect(parseProspectsCsv("Company_Name,WEBSITE\nAcme,acme.com").rows[0]).toMatchObject({
      companyName: "Acme",
      website: "acme.com",
    });
  });

  it("keeps commas inside quoted fields", () => {
    const csv = ['company_name,description', '"Acme, Inc.","Sells widgets, gadgets"'].join("\n");

    expect(parseProspectsCsv(csv).rows[0]).toMatchObject({
      companyName: "Acme, Inc.",
      description: "Sells widgets, gadgets",
    });
  });

  it("unescapes a doubled quote inside a quoted field", () => {
    const csv = ['company_name', '"The ""Big"" Co"'].join("\n");

    expect(parseProspectsCsv(csv).rows[0]!.companyName).toBe('The "Big" Co');
  });

  it("handles CRLF line endings and ignores blank lines", () => {
    const csv = "company_name\r\nAcme\r\n\r\nBeta\r\n";

    expect(parseProspectsCsv(csv).rows.map((r) => r.companyName)).toEqual(["Acme", "Beta"]);
  });

  it("trims surrounding whitespace from values", () => {
    expect(parseProspectsCsv("company_name , website\n  Acme  ,  acme.com  ").rows[0]).toMatchObject(
      { companyName: "Acme", website: "acme.com" },
    );
  });

  it("treats an empty optional cell as undefined rather than an empty string", () => {
    const row = parseProspectsCsv("company_name,website,industry\nAcme,,SaaS").rows[0]!;

    expect(row.website).toBeUndefined();
    expect(row.industry).toBe("SaaS");
  });

  it("skips a row with no company_name but imports the rest, reporting the skip", () => {
    const csv = ["company_name,website", "Acme,acme.com", ",orphan.com", "Beta,beta.com"].join("\n");
    const result = parseProspectsCsv(csv);

    expect(result.rows.map((r) => r.companyName)).toEqual(["Acme", "Beta"]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Row 3");
  });

  it("rejects the whole import when the required column is absent", () => {
    const result = parseProspectsCsv("name,website\nAcme,acme.com");

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual(["Missing required column: company_name"]);
  });

  it.each([["an empty string", ""], ["only whitespace and newlines", "  \n\n \r\n"]])(
    "reports %s as having no content",
    (_label, text) => {
      expect(parseProspectsCsv(text)).toEqual({ rows: [], errors: ["No content to import."] });
    },
  );

  it("returns no rows for a header with no data lines", () => {
    expect(parseProspectsCsv("company_name,website")).toEqual({ rows: [], errors: [] });
  });

  it("tolerates a short row that stops before the optional columns", () => {
    const csv = ["company_name,website,industry", "Acme"].join("\n");

    expect(parseProspectsCsv(csv).rows[0]).toMatchObject({
      companyName: "Acme",
      website: undefined,
      industry: undefined,
    });
  });
});
