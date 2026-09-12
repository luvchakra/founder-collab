/**
 * COMPLY-P0-03.2 (Inventory Tax Context): "Read product/service classification from
 * Inventory." See `queries.ts`'s own docstring for why this reads `core.items` directly
 * rather than calling `@cofounderai/module-inventory`'s `contract/index.ts` -- the
 * classification fields the backlog means (HSN/tax rate/kind) are `core`-owned, not
 * `inventory`-schema-owned.
 */

export type ItemKind = "good" | "service" | "labour" | "part" | "expense";

export type ItemTaxContext = {
  id: string;
  kind: ItemKind;
  sku: string | null;
  name: string;
  unit: string;
  hsnCode: string | null;
  taxRate: number;
  status: string;
  /** `core.items.category_id` -- COMPLY-P1-02.5 (Product/Service Taxability) reads this to
   * look up a business's own `gst.item_category_tax_classifications` mapping. `null` when
   * the item has no category assigned at all (not every item needs one). */
  categoryId: string | null;
};
