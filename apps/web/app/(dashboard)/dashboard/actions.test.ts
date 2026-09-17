/**
 * The two creation actions. Both end in a redirect (which Next implements by throwing),
 * so the mocked redirect throws a sentinel — without that, an action that fell through
 * would pass a test that only checked the mutation ran.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
  revalidatePath: vi.fn(),
  createBusiness: vi.fn(),
  createProduct: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: h.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@cofounderai/module-discovery/lib/tenancy/mutations", () => ({
  createBusiness: h.createBusiness,
  createProduct: h.createProduct,
}));

const { createBusinessAction, createProductAction } = await import("./actions");

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, v);
  return data;
}

async function captureRedirect(run: () => Promise<unknown>) {
  await expect(run()).rejects.toThrow(/^NEXT_REDIRECT:/);
  return h.redirect.mock.calls.at(-1)![0] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.createBusiness.mockResolvedValue({ id: "biz-1" });
  h.createProduct.mockResolvedValue({ id: "prod-1" });
});

describe("createBusinessAction", () => {
  it("creates the business and lands on it", async () => {
    const target = await captureRedirect(() =>
      createBusinessAction("acct-1", form({ name: "Acme", website: "acme.com", industry: "Mfg" })),
    );

    expect(h.createBusiness).toHaveBeenCalledWith("acct-1", {
      name: "Acme",
      website: "acme.com",
      industry: "Mfg",
    });
    expect(target).toBe("/dashboard/businesses/biz-1");
  });

  it("passes empty strings for omitted fields, letting the mutation normalize them", async () => {
    await captureRedirect(() => createBusinessAction("acct-1", form({ name: "Acme" })));

    expect(h.createBusiness).toHaveBeenCalledWith("acct-1", {
      name: "Acme",
      website: "",
      industry: "",
    });
  });

  it("refreshes the dashboard, which lists businesses", async () => {
    await captureRedirect(() => createBusinessAction("acct-1", form({ name: "Acme" })));

    expect(h.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("lets a validation failure propagate instead of redirecting", async () => {
    h.createBusiness.mockRejectedValue(new Error("Business name is required."));

    await expect(createBusinessAction("acct-1", form({ name: "" }))).rejects.toThrow(
      "Business name is required.",
    );
    expect(h.redirect).not.toHaveBeenCalled();
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("createProductAction", () => {
  it("creates the product and lands on it", async () => {
    const target = await captureRedirect(() =>
      createProductAction("biz-1", form({ name: "Widgets", website: "widgets.example" })),
    );

    expect(h.createProduct).toHaveBeenCalledWith("biz-1", {
      name: "Widgets",
      website: "widgets.example",
    });
    expect(target).toBe("/dashboard/businesses/biz-1/products/prod-1");
  });

  it("refreshes the business page, which lists products", async () => {
    await captureRedirect(() => createProductAction("biz-1", form({ name: "Widgets" })));

    expect(h.revalidatePath).toHaveBeenCalledWith("/dashboard/businesses/biz-1");
  });

  it("lets a failure propagate", async () => {
    h.createProduct.mockRejectedValue(new Error("Product name is required."));

    await expect(createProductAction("biz-1", form({ name: "" }))).rejects.toThrow(
      "Product name is required.",
    );
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it("passes empty strings through when the create form omits its optional fields", async () => {
    await expect(createBusinessAction("acct-1", form({ name: "Acme" }))).rejects.toThrow(
      /NEXT_REDIRECT/,
    );

    expect(h.createBusiness).toHaveBeenCalledWith("acct-1", {
      name: "Acme",
      website: "",
      industry: "",
    });
  });

  it("does the same for a product", async () => {
    await expect(createProductAction("biz-1", form({ name: "Widgets" }))).rejects.toThrow(
      /NEXT_REDIRECT/,
    );

    expect(h.createProduct).toHaveBeenCalledWith("biz-1", { name: "Widgets", website: "" });
  });
});
