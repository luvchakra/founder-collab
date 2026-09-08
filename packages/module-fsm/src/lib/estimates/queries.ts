import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { ChargeableItemOption, Estimate, EstimateLine } from "./types";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

function fsmSchemaClient() {
  return createCoreClient({ schema: "fsm" });
}

const ESTIMATE_SELECT =
  "id, number, status, doc_date, party_id, source_ref, subtotal, discount_amount, shipping_amount, cgst_amount, sgst_amount, igst_amount, total_amount, created_at, updated_at";

function toEstimate(row: Record<string, unknown>): Estimate {
  const sourceRef = (row.source_ref as { opportunity_id?: string }) ?? {};
  return {
    id: row.id as string,
    number: row.number as string | null,
    status: row.status as string,
    doc_date: row.doc_date as string,
    opportunity_id: sourceRef.opportunity_id ?? "",
    party_id: row.party_id as string,
    subtotal: Number(row.subtotal),
    discount_amount: Number(row.discount_amount),
    shipping_amount: Number(row.shipping_amount),
    cgst_amount: Number(row.cgst_amount),
    sgst_amount: Number(row.sgst_amount),
    igst_amount: Number(row.igst_amount),
    total_amount: Number(row.total_amount),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

/** An opportunity has at most one estimate document at a time in this platform's MUST
 * scope (PRD's own SHOULD list -- "multiple estimate options (good/better/best)" -- is
 * explicitly out of scope for now). `business_id` is a "which of my businesses" filter,
 * not the authorization check (RLS is) -- same reasoning as opportunities/queries.ts. */
export const getEstimateForOpportunity = cache(
  async (businessId: string, opportunityId: string): Promise<Estimate | null> => {
    const core = await coreClient();
    const { data, error } = await core
      .from("documents")
      .select(ESTIMATE_SELECT)
      .eq("business_id", businessId)
      .eq("doc_type", "estimate")
      .eq("source_module", "fsm")
      .contains("source_ref", { opportunity_id: opportunityId })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? toEstimate(data) : null;
  },
);

export const getEstimate = cache(async (businessId: string, estimateId: string): Promise<Estimate | null> => {
  const core = await coreClient();
  const { data, error } = await core
    .from("documents")
    .select(ESTIMATE_SELECT)
    .eq("business_id", businessId)
    .eq("id", estimateId)
    .maybeSingle();
  if (error) throw error;
  return data ? toEstimate(data) : null;
});

/** No PostgREST embed across `core.document_lines` / `core.items` / `fsm.job_charge_types`
 * (three separate tables, two of them cross-schema) -- joined here in JS, same "no
 * embed" precedent as module-inventory's own lib. */
export const listEstimateLines = cache(async (businessId: string, estimateId: string): Promise<EstimateLine[]> => {
  const core = await coreClient();
  const { data: lines, error } = await core
    .from("document_lines")
    .select("id, item_id, quantity, unit_price, tax_rate, taxable, hsn_code, cgst_amount, sgst_amount, igst_amount, job_charge_type_id, sort_order")
    .eq("business_id", businessId)
    .eq("document_id", estimateId)
    .order("sort_order");
  if (error) throw error;
  if (lines.length === 0) return [];

  const itemIds = [...new Set(lines.map((l) => l.item_id))];
  const chargeTypeIds = [...new Set(lines.map((l) => l.job_charge_type_id).filter((id): id is string => Boolean(id)))];

  const [itemsRes, chargeTypesRes] = await Promise.all([
    core.from("items").select("id, name, sku").in("id", itemIds),
    chargeTypeIds.length
      ? (await fsmSchemaClient()).from("job_charge_types").select("id, name").in("id", chargeTypeIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (chargeTypesRes.error) throw chargeTypesRes.error;

  const itemById = new Map(itemsRes.data.map((i) => [i.id, i]));
  const chargeTypeById = new Map(chargeTypesRes.data.map((c) => [c.id, c.name]));

  return lines.map((l) => ({
    id: l.id,
    item_id: l.item_id,
    item_name: itemById.get(l.item_id)?.name ?? "Unknown item",
    item_sku: itemById.get(l.item_id)?.sku ?? null,
    quantity: Number(l.quantity),
    unit_price: Number(l.unit_price),
    tax_rate: Number(l.tax_rate),
    taxable: l.taxable,
    hsn_code: l.hsn_code,
    cgst_amount: Number(l.cgst_amount),
    sgst_amount: Number(l.sgst_amount),
    igst_amount: Number(l.igst_amount),
    job_charge_type_id: l.job_charge_type_id,
    job_charge_type_name: l.job_charge_type_id ? (chargeTypeById.get(l.job_charge_type_id) ?? null) : null,
    sort_order: l.sort_order,
  }));
});

export const listChargeableItemOptions = cache(async (businessId: string): Promise<ChargeableItemOption[]> => {
  const core = await coreClient();
  const { data, error } = await core
    .from("items")
    .select("id, name, sku, unit, tax_rate, selling_price")
    .eq("business_id", businessId)
    .eq("status", "active")
    .order("name");
  if (error) throw error;
  return data;
});
