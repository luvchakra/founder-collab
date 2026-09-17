/**
 * The product page's actions. The inline-edit trio each patch one field and refresh a
 * different set of paths — a rename shows in three places (product page, business page,
 * dashboard nav), a description only in one — and each returns state rather than throwing
 * so Next's production redaction doesn't swallow the reason.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  unstable_rethrow: vi.fn((error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_")) throw error;
  }),
  revalidatePath: vi.fn(),
  updateProduct: vi.fn(),
  addFileKnowledgeSource: vi.fn(),
  deleteKnowledgeSource: vi.fn(),
  updateKnowledgeSource: vi.fn(),
  understandProduct: vi.fn(),
  runAiAction: vi.fn(async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return null;
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Something went wrong." };
    }
  }),
}));

vi.mock("next/navigation", () => ({ unstable_rethrow: h.unstable_rethrow }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/mutations", () => ({ updateProduct: h.updateProduct }));
vi.mock("@cofounderai/module-discovery/lib/knowledge/mutations", () => ({
  addFileKnowledgeSource: h.addFileKnowledgeSource,
  deleteKnowledgeSource: h.deleteKnowledgeSource,
  updateKnowledgeSource: h.updateKnowledgeSource,
}));
vi.mock("@cofounderai/module-discovery/lib/ai/understand-product", () => ({
  understandProduct: h.understandProduct,
}));
vi.mock("@cofounderai/core/actions/ai-action-state", () => ({ runAiAction: h.runAiAction }));

const {
  addFileSourceAction,
  deleteSourceAction,
  generateProductProfileAction,
  renameProductAction,
  updateProductDescriptionAction,
  updateProductWebsiteAction,
  updateSourceAction,
} = await import("./actions");

const PRODUCT_PATH = "/dashboard/businesses/biz-1/products/prod-1";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks wipes recorded calls but keeps implementations, so a mockRejectedValue
  // set in one test would leak into the next — re-establish the happy path explicitly.
  h.updateProduct.mockResolvedValue({ id: "prod-1" });
  h.updateKnowledgeSource.mockResolvedValue(undefined);
  h.addFileKnowledgeSource.mockResolvedValue(undefined);
  h.deleteKnowledgeSource.mockResolvedValue(undefined);
  h.understandProduct.mockResolvedValue({ id: "prod-1" });
});

describe("renameProductAction", () => {
  it("renames and reports success", async () => {
    expect(await renameProductAction("biz-1", "prod-1", null, form({ name: "  New  " }))).toEqual({
      success: true,
    });
    expect(h.updateProduct).toHaveBeenCalledWith("prod-1", { name: "New" });
  });

  it("refreshes every place the name appears", async () => {
    await renameProductAction("biz-1", "prod-1", null, form({ name: "New" }));

    expect(h.revalidatePath.mock.calls.map((c) => c[0])).toEqual([
      PRODUCT_PATH,
      "/dashboard/businesses/biz-1",
      "/dashboard",
    ]);
  });

  it.each([["an empty name", ""], ["a whitespace name", "  "]])(
    "rejects %s without calling the mutation",
    async (_label, name) => {
      expect(await renameProductAction("biz-1", "prod-1", null, form({ name }))).toEqual({
        error: "Name is required.",
      });
      expect(h.updateProduct).not.toHaveBeenCalled();
    },
  );

  it("returns a failure as state", async () => {
    h.updateProduct.mockRejectedValue(new Error("denied"));

    expect(await renameProductAction("biz-1", "prod-1", null, form({ name: "X" }))).toEqual({
      error: "denied",
    });
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("lets a Next control-flow throw propagate", async () => {
    h.updateProduct.mockRejectedValue(new Error("NEXT_REDIRECT;/x"));

    await expect(renameProductAction("biz-1", "prod-1", null, form({ name: "X" }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });
});

describe("description and website edits", () => {
  it.each([
    ["updateProductDescriptionAction", () => updateProductDescriptionAction, "description"],
    ["updateProductWebsiteAction", () => updateProductWebsiteAction, "website"],
  ] as const)("%s patches only its own field", async (_name, getAction, field) => {
    expect(await getAction()("biz-1", "prod-1", null, form({ value: "  val  " }))).toEqual({
      success: true,
    });
    expect(h.updateProduct).toHaveBeenCalledWith("prod-1", { [field]: "  val  " });
  });

  it.each([
    ["updateProductDescriptionAction", () => updateProductDescriptionAction],
    ["updateProductWebsiteAction", () => updateProductWebsiteAction],
  ] as const)("%s refreshes only the product page", async (_name, getAction) => {
    await getAction()("biz-1", "prod-1", null, form({ value: "v" }));

    expect(h.revalidatePath).toHaveBeenCalledTimes(1);
    expect(h.revalidatePath).toHaveBeenCalledWith(PRODUCT_PATH);
  });

  it.each([
    ["updateProductDescriptionAction", () => updateProductDescriptionAction],
    ["updateProductWebsiteAction", () => updateProductWebsiteAction],
  ] as const)("%s returns a failure as state", async (_name, getAction) => {
    h.updateProduct.mockRejectedValue(new Error("denied"));

    expect(await getAction()("biz-1", "prod-1", null, form({ value: "v" }))).toEqual({
      error: "denied",
    });
  });
});

describe("knowledge source actions", () => {
  it("uploads a chosen file", async () => {
    const data = new FormData();
    data.append("file", new File([new Uint8Array(10)], "spec.pdf", { type: "application/pdf" }));

    await addFileSourceAction("biz-1", "prod-1", "w1", data);

    expect(h.addFileKnowledgeSource).toHaveBeenCalledWith("w1", expect.any(File));
    expect(h.revalidatePath).toHaveBeenCalledWith(PRODUCT_PATH);
  });

  it.each([
    ["no file at all", new FormData()],
    [
      "an empty file",
      (() => {
        const d = new FormData();
        d.append("file", new File([], "empty.pdf", { type: "application/pdf" }));
        return d;
      })(),
    ],
  ])("refuses %s", async (_label, data) => {
    await expect(addFileSourceAction("biz-1", "prod-1", "w1", data)).rejects.toThrow(
      "Choose a file to upload.",
    );
    expect(h.addFileKnowledgeSource).not.toHaveBeenCalled();
  });

  it("deletes a source and refreshes", async () => {
    await deleteSourceAction("biz-1", "prod-1", "src-1");

    expect(h.deleteKnowledgeSource).toHaveBeenCalledWith("src-1");
    expect(h.revalidatePath).toHaveBeenCalledWith(PRODUCT_PATH);
  });

  it("edits a source's content, returning state", async () => {
    expect(await updateSourceAction("biz-1", "prod-1", "src-1", null, form({ value: "new text" }))).toEqual(
      { success: true },
    );
    expect(h.updateKnowledgeSource).toHaveBeenCalledWith("src-1", "new text");
  });

  it("returns a failed source edit as state", async () => {
    h.updateKnowledgeSource.mockRejectedValue(new Error("denied"));

    expect(await updateSourceAction("biz-1", "prod-1", "src-1", null, form({ value: "x" }))).toEqual({
      error: "denied",
    });
  });
});

describe("generateProductProfileAction", () => {
  it("generates and refreshes, returning null on success", async () => {
    expect(await generateProductProfileAction("biz-1", "prod-1", null, form({}))).toBeNull();

    expect(h.understandProduct).toHaveBeenCalledWith("prod-1", { force: false });
    expect(h.revalidatePath).toHaveBeenCalledWith(PRODUCT_PATH);
  });

  it("forces a regenerate only when asked", async () => {
    await generateProductProfileAction("biz-1", "prod-1", null, form({ force: "true" }));

    expect(h.understandProduct).toHaveBeenCalledWith("prod-1", { force: true });
  });

  it("returns a provider failure as state", async () => {
    h.understandProduct.mockRejectedValue(new Error("Connect an AI provider."));

    expect(await generateProductProfileAction("biz-1", "prod-1", null, form({}))).toEqual({
      error: "Connect an AI provider.",
    });
  });
});

/**
 * Every inline-edit action reads its field with a  default and reports a non-Error
 * throw generically. Both matter: an EditableText that submits nothing must clear the
 * field rather than write the string "undefined", and a thrown non-Error (a rejected
 * string, a Supabase error object) must still reach the founder as a message.
 */
describe("missing fields and non-Error failures", () => {
  const EDITS = [
    ["renameProductAction", () => renameProductAction],
    ["updateProductDescriptionAction", () => updateProductDescriptionAction],
    ["updateProductWebsiteAction", () => updateProductWebsiteAction],
  ] as const;

  it("clears the description when the form submits no value at all", async () => {
    expect(await updateProductDescriptionAction("biz-1", "prod-1", null, new FormData())).toEqual({
      success: true,
    });
    expect(h.updateProduct).toHaveBeenCalledWith("prod-1", { description: "" });
  });

  it("clears the website the same way", async () => {
    await updateProductWebsiteAction("biz-1", "prod-1", null, new FormData());

    expect(h.updateProduct).toHaveBeenCalledWith("prod-1", { website: "" });
  });

  it("refuses a rename submitted with no name field", async () => {
    expect(await renameProductAction("biz-1", "prod-1", null, new FormData())).toEqual({
      error: "Name is required.",
    });
    expect(h.updateProduct).not.toHaveBeenCalled();
  });

  it.each(EDITS)("%s reports a non-Error failure generically", async (_name, getAction) => {
    h.updateProduct.mockRejectedValue("a string");

    expect(await getAction()("biz-1", "prod-1", null, form({ name: "n", value: "v" }))).toEqual({
      error: "Something went wrong.",
    });
  });

  it("clears a knowledge source edited to nothing", async () => {
    await updateSourceAction("biz-1", "prod-1", "src-1", null, new FormData());

    expect(h.updateKnowledgeSource).toHaveBeenCalledWith("src-1", "");
  });

  it("reports a non-Error source failure generically", async () => {
    h.updateKnowledgeSource.mockRejectedValue("a string");

    expect(await updateSourceAction("biz-1", "prod-1", "src-1", null, form({ value: "v" }))).toEqual({
      error: "Something went wrong.",
    });
  });
});

/**
 * Every inline-edit action reads its field with a "?? empty string" default and reports a
 * non-Error throw generically. Both matter: an EditableText that submits nothing must
 * clear the field rather than write the string "undefined", and a thrown non-Error (a
 * rejected string, a Supabase error object) must still reach the founder as a message.
 */
describe("missing fields and non-Error failures", () => {
  const EDITS = [
    ["renameProductAction", () => renameProductAction],
    ["updateProductDescriptionAction", () => updateProductDescriptionAction],
    ["updateProductWebsiteAction", () => updateProductWebsiteAction],
  ] as const;

  it("clears the description when the form submits no value at all", async () => {
    expect(await updateProductDescriptionAction("biz-1", "prod-1", null, new FormData())).toEqual({
      success: true,
    });
    expect(h.updateProduct).toHaveBeenCalledWith("prod-1", { description: "" });
  });

  it("clears the website the same way", async () => {
    await updateProductWebsiteAction("biz-1", "prod-1", null, new FormData());

    expect(h.updateProduct).toHaveBeenCalledWith("prod-1", { website: "" });
  });

  it("refuses a rename submitted with no name field", async () => {
    expect(await renameProductAction("biz-1", "prod-1", null, new FormData())).toEqual({
      error: "Name is required.",
    });
    expect(h.updateProduct).not.toHaveBeenCalled();
  });

  it.each(EDITS)("%s reports a non-Error failure generically", async (_name, getAction) => {
    h.updateProduct.mockRejectedValue("a string");

    expect(await getAction()("biz-1", "prod-1", null, form({ name: "n", value: "v" }))).toEqual({
      error: "Something went wrong.",
    });
  });

  it("clears a knowledge source edited to nothing", async () => {
    await updateSourceAction("biz-1", "prod-1", "src-1", null, new FormData());

    expect(h.updateKnowledgeSource).toHaveBeenCalledWith("src-1", "");
  });

  it("reports a non-Error source failure generically", async () => {
    h.updateKnowledgeSource.mockRejectedValue("a string");

    expect(await updateSourceAction("biz-1", "prod-1", "src-1", null, form({ value: "v" }))).toEqual({
      error: "Something went wrong.",
    });
  });
});
