/**
 * CSV import's deduplication (R9) is the substance: a paste must be deduped against the
 * existing pipeline *and* against itself, since two rows in one file can share a domain or
 * name. Getting the in-batch half wrong would create the duplicate records the party model
 * exists to prevent, and would do it silently.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  revalidatePath: vi.fn(),
  parseProspectsCsv: vi.fn(),
  createProspectsBulk: vi.fn(),
  extractDomain: vi.fn(),
  findDuplicateProspect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@cofounderai/module-discovery/lib/prospects/csv", () => ({
  parseProspectsCsv: h.parseProspectsCsv,
}));
vi.mock("@cofounderai/module-discovery/lib/prospects/mutations", () => ({
  createProspectsBulk: h.createProspectsBulk,
  extractDomain: h.extractDomain,
}));
vi.mock("@cofounderai/module-discovery/lib/prospects/duplicates", () => ({
  findDuplicateProspect: h.findDuplicateProspect,
}));

const { importProspectsAction } = await import("./actions");

const BASE = "/dashboard/businesses/biz-1/products/prod-1/prospects";

function form(csv: string) {
  const data = new FormData();
  data.append("csv", csv);
  return data;
}

function parsed(rows: { companyName: string; website?: string }[], errors: string[] = []) {
  h.parseProspectsCsv.mockReturnValue({ rows, errors });
}

async function captureRedirect(run: () => Promise<unknown>) {
  await expect(run()).rejects.toThrow(/^NEXT_REDIRECT:/);
  return h.redirect.mock.calls.at(-1)![0] as string;
}

function query(target: string) {
  return Object.fromEntries(new URL(target, "https://x").searchParams);
}

beforeEach(() => {
  vi.resetAllMocks();
  h.redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
  // Mirrors the real extractDomain: the scheme is optional (normalizeUrl adds it), and
  // "www." is stripped either way — a stand-in that only handled the scheme-ful form
  // would make the in-batch dedup test pass for the wrong reason.
  h.extractDomain.mockImplementation(
    (url: string) => url.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0] || null,
  );
  h.findDuplicateProspect.mockResolvedValue(null);
  h.createProspectsBulk.mockImplementation(async (_w: string, rows: unknown[]) => rows.length);
});

describe("importProspectsAction", () => {
  it("imports every unique row and reports the counts", async () => {
    parsed([{ companyName: "Acme", website: "acme.com" }, { companyName: "Beta", website: "beta.com" }]);

    const target = await captureRedirect(() => importProspectsAction("biz-1", "prod-1", "w1", form("csv")));

    expect(h.createProspectsBulk).toHaveBeenCalledWith("w1", [
      { companyName: "Acme", website: "acme.com" },
      { companyName: "Beta", website: "beta.com" },
    ]);
    expect(query(target)).toEqual({ imported: "2", skipped: "0", duplicates: "0" });
  });

  it("skips a row that already exists in the pipeline", async () => {
    parsed([{ companyName: "Acme", website: "acme.com" }, { companyName: "Beta", website: "beta.com" }]);
    h.findDuplicateProspect.mockImplementation(async (_w: string, c: { companyName: string }) =>
      c.companyName === "Acme" ? { id: "existing" } : null,
    );

    const target = await captureRedirect(() => importProspectsAction("biz-1", "prod-1", "w1", form("csv")));

    expect(h.createProspectsBulk).toHaveBeenCalledWith("w1", [{ companyName: "Beta", website: "beta.com" }]);
    expect(query(target)).toMatchObject({ imported: "1", duplicates: "1" });
  });

  it("dedupes two rows in the same paste that share a domain", async () => {
    parsed([
      { companyName: "Acme", website: "acme.com" },
      { companyName: "Acme Inc", website: "www.acme.com" },
    ]);

    const target = await captureRedirect(() => importProspectsAction("biz-1", "prod-1", "w1", form("csv")));

    expect(h.createProspectsBulk).toHaveBeenCalledWith("w1", [{ companyName: "Acme", website: "acme.com" }]);
    expect(query(target)).toMatchObject({ imported: "1", duplicates: "1" });
  });

  it("dedupes two rows in the same paste that share a name, case-insensitively", async () => {
    parsed([{ companyName: "Acme" }, { companyName: "  acme  " }]);

    const target = await captureRedirect(() => importProspectsAction("biz-1", "prod-1", "w1", form("csv")));

    expect(h.createProspectsBulk).toHaveBeenCalledWith("w1", [{ companyName: "Acme" }]);
    expect(query(target)).toMatchObject({ duplicates: "1" });
  });

  it("does not query the pipeline for a row already excluded in-batch", async () => {
    parsed([{ companyName: "Acme" }, { companyName: "Acme" }]);

    await captureRedirect(() => importProspectsAction("biz-1", "prod-1", "w1", form("csv")));

    expect(h.findDuplicateProspect).toHaveBeenCalledTimes(1);
  });

  it("reports rows the parser rejected as skipped", async () => {
    parsed([{ companyName: "Acme" }], ["Row 3: missing company_name, skipped."]);

    const target = await captureRedirect(() => importProspectsAction("biz-1", "prod-1", "w1", form("csv")));

    expect(query(target)).toMatchObject({ imported: "1", skipped: "1" });
  });

  it("inserts nothing when every row is a duplicate", async () => {
    parsed([{ companyName: "Acme" }]);
    h.findDuplicateProspect.mockResolvedValue({ id: "existing" });

    const target = await captureRedirect(() => importProspectsAction("biz-1", "prod-1", "w1", form("csv")));

    expect(h.createProspectsBulk).not.toHaveBeenCalled();
    expect(query(target)).toMatchObject({ imported: "0", duplicates: "1" });
  });

  it("surfaces the parser's own reason when nothing could be parsed", async () => {
    parsed([], ["Missing required column: company_name"]);

    await expect(importProspectsAction("biz-1", "prod-1", "w1", form("nope"))).rejects.toThrow(
      "Missing required column: company_name",
    );
  });

  it("falls back to a generic reason when the parser gave none", async () => {
    parsed([], []);

    await expect(importProspectsAction("biz-1", "prod-1", "w1", form(""))).rejects.toThrow(
      "No valid rows to import.",
    );
  });

  it("refreshes the list before redirecting", async () => {
    parsed([{ companyName: "Acme" }]);

    await captureRedirect(() => importProspectsAction("biz-1", "prod-1", "w1", form("csv")));

    expect(h.revalidatePath).toHaveBeenCalledWith(BASE);
  });

  it("treats a submission with no csv field as an empty paste", async () => {
    parsed([], ["Paste a CSV with a header row."]);

    await expect(importProspectsAction("biz-1", "prod-1", "w1", new FormData())).rejects.toThrow(
      "Paste a CSV with a header row.",
    );
    expect(h.parseProspectsCsv).toHaveBeenCalledWith("");
    expect(h.createProspectsBulk).not.toHaveBeenCalled();
  });
});
