/**
 * Inline rename/description edits. These return state rather than throwing (Next redacts a
 * thrown Server Action error in production), but must still let Next's own control-flow
 * throws through — hence unstable_rethrow before the conversion.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  unstable_rethrow: vi.fn((error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_")) throw error;
  }),
  revalidatePath: vi.fn(),
  updateBusiness: vi.fn(),
}));

vi.mock("next/navigation", () => ({ unstable_rethrow: h.unstable_rethrow }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/mutations", () => ({
  updateBusiness: h.updateBusiness,
}));

const { renameBusinessAction, updateBusinessDescriptionAction } = await import("./actions");

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.updateBusiness.mockResolvedValue({ id: "biz-1" });
});

describe("renameBusinessAction", () => {
  it("renames and reports success", async () => {
    const result = await renameBusinessAction("biz-1", null, form({ name: "  Renamed  " }));

    expect(h.updateBusiness).toHaveBeenCalledWith("biz-1", { name: "Renamed" });
    expect(result).toEqual({ success: true });
  });

  it("refreshes both the business page and the dashboard, which also shows the name", async () => {
    await renameBusinessAction("biz-1", null, form({ name: "Renamed" }));

    expect(h.revalidatePath).toHaveBeenCalledWith("/dashboard/businesses/biz-1");
    expect(h.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it.each([["an empty name", ""], ["a whitespace name", "   "]])(
    "rejects %s without calling the mutation",
    async (_label, name) => {
      const result = await renameBusinessAction("biz-1", null, form({ name }));

      expect(result).toEqual({ error: "Name is required." });
      expect(h.updateBusiness).not.toHaveBeenCalled();
    },
  );

  it("returns a failure as state, so the founder sees the real reason", async () => {
    h.updateBusiness.mockRejectedValue(new Error("row-level security"));

    expect(await renameBusinessAction("biz-1", null, form({ name: "X" }))).toEqual({
      error: "row-level security",
    });
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for a non-Error throw", async () => {
    h.updateBusiness.mockRejectedValue("just a string");

    expect(await renameBusinessAction("biz-1", null, form({ name: "X" }))).toEqual({
      error: "Something went wrong.",
    });
  });

  it("lets a Next control-flow throw keep propagating", async () => {
    h.updateBusiness.mockRejectedValue(new Error("NEXT_REDIRECT;/login"));

    await expect(renameBusinessAction("biz-1", null, form({ name: "X" }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });
});

describe("updateBusinessDescriptionAction", () => {
  it("saves the description, including clearing it to empty", async () => {
    expect(await updateBusinessDescriptionAction("biz-1", null, form({ value: "About us" }))).toEqual(
      { success: true },
    );
    expect(h.updateBusiness).toHaveBeenCalledWith("biz-1", { description: "About us" });

    await updateBusinessDescriptionAction("biz-1", null, form({ value: "" }));
    expect(h.updateBusiness).toHaveBeenLastCalledWith("biz-1", { description: "" });
  });

  it("refreshes only the business page", async () => {
    await updateBusinessDescriptionAction("biz-1", null, form({ value: "x" }));

    expect(h.revalidatePath).toHaveBeenCalledTimes(1);
    expect(h.revalidatePath).toHaveBeenCalledWith("/dashboard/businesses/biz-1");
  });

  it("returns a failure as state", async () => {
    h.updateBusiness.mockRejectedValue(new Error("denied"));

    expect(await updateBusinessDescriptionAction("biz-1", null, form({ value: "x" }))).toEqual({
      error: "denied",
    });
  });

  it("refuses a rename submitted with no name field at all", async () => {
    expect(await renameBusinessAction("biz-1", null, new FormData())).toEqual({
      error: "Name is required.",
    });
    expect(h.updateBusiness).not.toHaveBeenCalled();
  });

  it("clears the description when the form submits no value", async () => {
    await updateBusinessDescriptionAction("biz-1", null, new FormData());

    expect(h.updateBusiness).toHaveBeenCalledWith("biz-1", { description: "" });
  });

  it("reports a non-Error failure generically", async () => {
    h.updateBusiness.mockRejectedValue("a string");

    expect(await updateBusinessDescriptionAction("biz-1", null, form({ value: "x" }))).toEqual({
      error: "Something went wrong.",
    });
  });
});
