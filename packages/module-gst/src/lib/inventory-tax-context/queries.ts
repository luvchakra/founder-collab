import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { ItemTaxContext } from "./types";

/**
 * COMPLY-P0-03.2 (Inventory Tax Context): "Read product/service classification from
 * Inventory."
 *
 * **Checked the entity-ownership map before deciding how to read this** (backlog rule 1 /
 * CLAUDE.md non-negotiable #5): the classification fields this story actually means --
 * HSN code, tax rate, and kind (good/service/labour/part/expense) -- are NOT
 * `inventory`-schema-owned at all; `docs/plan/00-MASTER-PLAN.md` §5 assigns them to
 * `core.items` explicitly ("Price / tax rate / HSN | on core.items + core.tax_rates |
 * inventory, fsm, gst | never duplicated per module"), and `core.items`' own migration
 * confirms it (`kind`, `hsn_code`, `tax_rate` are columns on `core.items`, not on any
 * `inventory.*` table -- `@cofounderai/module-inventory/contract/index.ts`'s own
 * `upsertItem` writes them there too, it doesn't own a separate copy).
 *
 * That makes this the SAME cross-module-read situation as COMPLY-P0-03.1: `core` data,
 * read directly (CLAUDE.md's ranked mechanism (1), "read shared data from core directly
 * -- no coupling"), NOT a `module-inventory` contract call (mechanism (2), reserved for
 * genuinely `inventory`-schema-owned data this module doesn't otherwise have visibility
 * into, e.g. stock availability). The backlog's own story title says "from Inventory"
 * because that's where a *user* thinks of a product as living, not because the bytes are
 * in the `inventory` Postgres schema -- flagged here rather than silently building a
 * contract call that would import from `@cofounderai/module-inventory` for data this
 * module can already read directly and more cheaply.
 *
 * Distinct from COMPLY-P0-03.1's `getDocumentContext`, which reads a document LINE's own
 * HSN/tax-rate SNAPSHOT (frozen at the moment that line was created -- never re-derived).
 * This file reads the item's CURRENT classification instead -- the answer to "what does
 * the product master say about this item's tax treatment right now," useful for
 * validating a new line before it's created or for classification-readiness checks
 * (COMPLY-P0-04.3 HSN/SAC, COMPLY-P1-12.1 Inventory Tax Readiness), not for reinterpreting
 * an already-issued document (which must never change after the fact).
 */

function coreClient() {
  return createCoreClient({ schema: "core" });
}

export function mapItemTaxContext(row: {
  id: string;
  kind: string;
  sku: string | null;
  name: string;
  unit: string;
  hsn_code: string | null;
  tax_rate: number;
  status: string;
}): ItemTaxContext {
  return {
    id: row.id,
    kind: row.kind as ItemTaxContext["kind"],
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    hsnCode: row.hsn_code,
    taxRate: row.tax_rate,
    status: row.status,
  };
}

/** One item's current tax classification, or `null` if it doesn't exist or doesn't
 * belong to `businessId`. */
export async function getItemTaxContext(businessId: string, itemId: string): Promise<ItemTaxContext | null> {
  const core = await coreClient();
  const { data, error } = await core
    .from("items")
    .select("id, kind, sku, name, unit, hsn_code, tax_rate, status")
    .eq("business_id", businessId)
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapItemTaxContext(data);
}

/** Batch form of `getItemTaxContext` -- e.g. resolving current classification for every
 * distinct item on a document's lines in one round trip, rather than one call per line. */
export async function listItemTaxContexts(businessId: string, itemIds: string[]): Promise<ItemTaxContext[]> {
  if (itemIds.length === 0) return [];
  const core = await coreClient();
  const { data, error } = await core
    .from("items")
    .select("id, kind, sku, name, unit, hsn_code, tax_rate, status")
    .eq("business_id", businessId)
    .in("id", itemIds);
  if (error) throw error;
  return data.map(mapItemTaxContext);
}

/** Every ACTIVE item's current tax classification for a business -- COMPLY-P0-09.5 (Risk
 * Dashboard)'s own "Invalid classification" signal needs the whole active catalog, not
 * just the items already referenced on a specific document's lines (`listItemTaxContexts`
 * above). `status = 'active'` only -- an archived/discontinued item's own stale
 * classification is not a live compliance risk worth surfacing on an ongoing dashboard. */
export async function listAllItemTaxContexts(businessId: string): Promise<ItemTaxContext[]> {
  const core = await coreClient();
  const { data, error } = await core
    .from("items")
    .select("id, kind, sku, name, unit, hsn_code, tax_rate, status")
    .eq("business_id", businessId)
    .eq("status", "active");
  if (error) throw error;
  return data.map(mapItemTaxContext);
}
