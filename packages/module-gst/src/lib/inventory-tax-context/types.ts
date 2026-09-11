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
};
