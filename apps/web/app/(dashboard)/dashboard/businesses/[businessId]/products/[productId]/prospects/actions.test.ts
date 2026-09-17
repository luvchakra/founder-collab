/**
 * R9's duplicate guard is the substance here: adding a prospect that already exists must
 * land the founder on the existing one (flagged) rather than creating a second record,
 * since the whole party model depends on one company being one row.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  revalidatePath: vi.fn(),
  createProspect: vi.fn(),
  findDuplicateProspect: vi.fn(),
  bulkResearchProspects: vi.fn(),
  bulkScoreProspects: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@cofounderai/module-discovery/lib/prospects/mutations", () => ({
  createProspect: h.createProspect,
}));
vi.mock("@cofounderai/module-discovery/lib/prospects/duplicates", () => ({
  findDuplicateProspect: h.findDuplicateProspect,
}));
vi.mock("@cofounderai/module-discovery/lib/prospects/bulk-actions", () => ({
  bulkResearchProspects: h.bulkResearchProspects,
  bulkScoreProspects: h.bulkScoreProspects,
}));

const { bulkResearchAction, bulkScoreAction, createProspectAction } = await import("./actions");

const BASE = "/dashboard/businesses/biz-1/products/prod-1/prospects";

function form(fields: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    for (const one of Array.isArray(v) ? v : [v]) data.append(k, one);
  }
  return data;
}

async function captureRedirect(run: () => Promise<unknown>) {
  await expect(run()).rejects.toThrow(/^NEXT_REDIRECT:/);
  return h.redirect.mock.calls.at(-1)![0] as string;
}

beforeEach(() => {
  vi.resetAllMocks();
  h.redirect.mockImplementation((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  });
  h.findDuplicateProspect.mockResolvedValue(null);
  h.createProspect.mockResolvedValue({ id: "p1" });
  h.bulkResearchProspects.mockResolvedValue({ completed: 2, skipped: 1, limitReached: false });
  h.bulkScoreProspects.mockResolvedValue({ completed: 1, skipped: 0, limitReached: true });
});

describe("createProspectAction", () => {
  it("creates the prospect and lands on it", async () => {
    const target = await captureRedirect(() =>
      createProspectAction("biz-1", "prod-1", "w1", form({ companyName: "Acme", website: "acme.com" })),
    );

    expect(h.createProspect).toHaveBeenCalledWith("w1", expect.objectContaining({ companyName: "Acme" }));
    expect(target).toBe(`${BASE}/p1`);
  });

  it("checks for a duplicate against the workspace before creating", async () => {
    await captureRedirect(() =>
      createProspectAction("biz-1", "prod-1", "w1", form({ companyName: "Acme", website: "acme.com" })),
    );

    expect(h.findDuplicateProspect).toHaveBeenCalledWith("w1", {
      companyName: "Acme",
      website: "acme.com",
    });
  });

  it("lands on the existing prospect, flagged, instead of creating a second record", async () => {
    h.findDuplicateProspect.mockResolvedValue({ id: "existing-1", company_name: "Acme" });

    const target = await captureRedirect(() =>
      createProspectAction("biz-1", "prod-1", "w1", form({ companyName: "Acme" })),
    );

    expect(target).toBe(`${BASE}/existing-1?duplicate=1`);
    expect(h.createProspect).not.toHaveBeenCalled();
  });

  it("passes every optional field through for the mutation to normalize", async () => {
    await captureRedirect(() =>
      createProspectAction(
        "biz-1",
        "prod-1",
        "w1",
        form({ companyName: "Acme", industry: "Mfg", companySize: "50", location: "Pune", description: "x" }),
      ),
    );

    expect(h.createProspect).toHaveBeenCalledWith("w1", {
      companyName: "Acme",
      website: "",
      industry: "Mfg",
      companySize: "50",
      location: "Pune",
      description: "x",
    });
  });

  it("refreshes the list on both paths", async () => {
    await captureRedirect(() => createProspectAction("biz-1", "prod-1", "w1", form({ companyName: "A" })));
    expect(h.revalidatePath).toHaveBeenCalledWith(BASE);

    h.revalidatePath.mockClear();
    h.findDuplicateProspect.mockResolvedValue({ id: "existing-1" });
    await captureRedirect(() => createProspectAction("biz-1", "prod-1", "w1", form({ companyName: "A" })));
    expect(h.revalidatePath).toHaveBeenCalledWith(BASE);
  });

  it("lets a validation failure propagate rather than redirecting", async () => {
    h.createProspect.mockRejectedValue(new Error("Company name is required."));

    await expect(
      createProspectAction("biz-1", "prod-1", "w1", form({ companyName: "" })),
    ).rejects.toThrow("Company name is required.");
  });
});

describe("bulk actions", () => {
  it("researches the selected ids and reports the outcome in the URL", async () => {
    const target = await captureRedirect(() =>
      bulkResearchAction("biz-1", "prod-1", "w1", form({ ids: ["p1", "p2", "p3"] })),
    );

    expect(h.bulkResearchProspects).toHaveBeenCalledWith("w1", ["p1", "p2", "p3"]);
    expect(target).toBe(`${BASE}?bulkAction=research&bulkCompleted=2&bulkSkipped=1&bulkLimit=0`);
  });

  it("flags a hit usage ceiling in the URL, so the founder is told why it stopped", async () => {
    const target = await captureRedirect(() =>
      bulkScoreAction("biz-1", "prod-1", "w1", form({ ids: ["p1"] })),
    );

    expect(target).toBe(`${BASE}?bulkAction=score&bulkCompleted=1&bulkSkipped=0&bulkLimit=1`);
  });

  it("passes an empty selection straight through", async () => {
    h.bulkResearchProspects.mockResolvedValue({ completed: 0, skipped: 0, limitReached: false });

    await captureRedirect(() => bulkResearchAction("biz-1", "prod-1", "w1", form({})));

    expect(h.bulkResearchProspects).toHaveBeenCalledWith("w1", []);
  });

  it("refreshes the list before redirecting", async () => {
    await captureRedirect(() => bulkResearchAction("biz-1", "prod-1", "w1", form({ ids: ["p1"] })));

    expect(h.revalidatePath).toHaveBeenCalledWith(BASE);
  });
});
