/**
 * `core.items` is the canonical catalogue every module shares (00-MASTER-PLAN.md §5), so
 * the defaults it applies are platform-wide product decisions — an 18% GST slab, "pcs",
 * a `good` kind — not per-call-site conveniences. They are pinned here because changing
 * one silently would reprice every module's future documents.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, opArgs, writtenRow } from "../test-support/fake-supabase";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("../db/server", () => ({ createClient }));

const { createItem, createItemCategory, setItemInventoryAttrs } = await import("./mutations");

const BUSINESS = "b0000000-0000-0000-0000-000000000001";

function mock(data: unknown = { id: "i1" }, error: unknown = null) {
  const supabase = createFakeSupabase({ query: () => ({ data, error }) });
  createClient.mockResolvedValue(supabase);
  return supabase;
}

beforeEach(() => vi.clearAllMocks());

describe("createItemCategory", () => {
  it("nulls an unset description and parent", async () => {
    const supabase = mock();

    await createItemCategory({ businessId: BUSINESS, name: "Fasteners" });

    expect(writtenRow(supabase.queries("item_categories")[0]!)).toEqual({
      business_id: BUSINESS,
      name: "Fasteners",
      description: null,
      parent_id: null,
    });
  });

  it("carries a parent through, so categories can nest", async () => {
    const supabase = mock();

    await createItemCategory({ businessId: BUSINESS, name: "Bolts", parentId: "cat-1" });

    expect(writtenRow(supabase.queries("item_categories")[0]!)).toMatchObject({ parent_id: "cat-1" });
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(createItemCategory({ businessId: BUSINESS, name: "x" })).rejects.toThrow("denied");
  });
});

describe("createItem", () => {
  it("applies the platform's catalogue defaults", async () => {
    const supabase = mock();

    await createItem({ businessId: BUSINESS, name: "Widget" });

    expect(writtenRow(supabase.queries("items")[0]!)).toEqual({
      business_id: BUSINESS,
      kind: "good",
      sku: null,
      name: "Widget",
      description: null,
      category_id: null,
      supplier_party_id: null,
      unit: "pcs",
      hsn_code: null,
      tax_rate: 18,
      cost_price: 0,
      selling_price: 0,
      image_url: null,
    });
  });

  it.each(["service", "labour", "part", "expense"] as const)("honours an explicit '%s' kind", async (kind) => {
    const supabase = mock();

    await createItem({ businessId: BUSINESS, name: "Install", kind });

    expect(writtenRow(supabase.queries("items")[0]!)).toMatchObject({ kind });
  });

  it("honours a zero tax rate rather than falling back to 18", async () => {
    const supabase = mock();

    await createItem({ businessId: BUSINESS, name: "Exempt", taxRate: 0 });

    expect(writtenRow(supabase.queries("items")[0]!)).toMatchObject({ tax_rate: 0 });
  });

  it("honours zero prices rather than treating them as unset", async () => {
    const supabase = mock();

    await createItem({ businessId: BUSINESS, name: "Free", costPrice: 0, sellingPrice: 0 });

    expect(writtenRow(supabase.queries("items")[0]!)).toMatchObject({ cost_price: 0, selling_price: 0 });
  });

  it("carries every supplied field through", async () => {
    const supabase = mock();

    await createItem({
      businessId: BUSINESS,
      name: "Bolt",
      sku: "BLT-1",
      description: "M8",
      categoryId: "cat-1",
      supplierPartyId: "party-1",
      unit: "box",
      hsnCode: "7318",
      taxRate: 12,
      costPrice: 5,
      sellingPrice: 9,
      imageUrl: "https://cdn/x.png",
    });

    expect(writtenRow(supabase.queries("items")[0]!)).toMatchObject({
      sku: "BLT-1",
      unit: "box",
      hsn_code: "7318",
      tax_rate: 12,
      cost_price: 5,
      selling_price: 9,
      image_url: "https://cdn/x.png",
    });
  });

  it("runs RLS-scoped against core", async () => {
    mock();
    await createItem({ businessId: BUSINESS, name: "Widget" });
    expect(createClient).toHaveBeenCalledWith({ schema: "core" });
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(createItem({ businessId: BUSINESS, name: "x" })).rejects.toThrow("denied");
  });
});

describe("setItemInventoryAttrs", () => {
  it("upserts on item_id, so calling it twice updates rather than duplicates", async () => {
    const supabase = mock();

    await setItemInventoryAttrs({ businessId: BUSINESS, itemId: "i1" });

    const call = supabase.queries("item_inventory_attrs")[0]!;
    expect(opArgs(call, "upsert")![1]).toEqual({ onConflict: "item_id" });
  });

  it("defaults reorder thresholds to zero and barcode to null", async () => {
    const supabase = mock();

    await setItemInventoryAttrs({ businessId: BUSINESS, itemId: "i1" });

    expect(opArgs(supabase.queries("item_inventory_attrs")[0]!, "upsert")![0]).toEqual({
      item_id: "i1",
      business_id: BUSINESS,
      reorder_point: 0,
      reorder_quantity: 0,
      barcode: null,
    });
  });

  it("carries explicit thresholds through", async () => {
    const supabase = mock();

    await setItemInventoryAttrs({
      businessId: BUSINESS,
      itemId: "i1",
      reorderPoint: 10,
      reorderQuantity: 50,
      barcode: "123456",
    });

    expect(opArgs(supabase.queries("item_inventory_attrs")[0]!, "upsert")![0]).toMatchObject({
      reorder_point: 10,
      reorder_quantity: 50,
      barcode: "123456",
    });
  });

  it("propagates a failure", async () => {
    mock(null, new Error("denied"));
    await expect(setItemInventoryAttrs({ businessId: BUSINESS, itemId: "i1" })).rejects.toThrow("denied");
  });
});
