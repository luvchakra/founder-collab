import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { resolvePortalToken } from "../portal-tokens/tokens";
import type { ChargeableItemOption, Estimate, EstimateLine, PublicEstimateView } from "./types";

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

// Untyped like every other `.from(table)` caller against these schemas (Database = any) --
// matches core/api-v1/crud.server.ts's own `type AdminDb = any` precedent.
type QueryClient = any;

/** No PostgREST embed across `core.document_lines` / `core.items` / `fsm.job_charge_types`
 * (three separate tables, two of them cross-schema) -- joined here in JS, same "no
 * embed" precedent as module-inventory's own lib. Takes already-instantiated clients so
 * both the authenticated (`listEstimateLines`) and public/service-role
 * (`getPublicEstimateView`) callers share one implementation. */
interface RawLine {
  id: string;
  item_id: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  taxable: boolean;
  hsn_code: string | null;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  job_charge_type_id: string | null;
  sort_order: number;
}

async function loadEstimateLines(core: QueryClient, fsm: QueryClient, businessId: string, estimateId: string): Promise<EstimateLine[]> {
  const { data, error } = await core
    .from("document_lines")
    .select("id, item_id, quantity, unit_price, tax_rate, taxable, hsn_code, cgst_amount, sgst_amount, igst_amount, job_charge_type_id, sort_order")
    .eq("business_id", businessId)
    .eq("document_id", estimateId)
    .order("sort_order");
  if (error) throw error;
  const lines = data as RawLine[];
  if (lines.length === 0) return [];

  const itemIds = [...new Set(lines.map((l: RawLine) => l.item_id))];
  const chargeTypeIds = [...new Set(lines.map((l: RawLine) => l.job_charge_type_id).filter((id: string | null): id is string => Boolean(id)))];

  const [itemsRes, chargeTypesRes] = await Promise.all([
    core.from("items").select("id, name, sku").in("id", itemIds),
    chargeTypeIds.length
      ? fsm.from("job_charge_types").select("id, name").in("id", chargeTypeIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (chargeTypesRes.error) throw chargeTypesRes.error;

  const itemById = new Map<string, { id: string; name: string; sku: string | null }>(
    itemsRes.data.map((i: { id: string; name: string; sku: string | null }) => [i.id, i]),
  );
  const chargeTypeById = new Map<string, string>(chargeTypesRes.data.map((c: { id: string; name: string }) => [c.id, c.name]));

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
}

export const listEstimateLines = cache(async (businessId: string, estimateId: string): Promise<EstimateLine[]> => {
  const core = await coreClient();
  const fsm = await fsmSchemaClient();
  return loadEstimateLines(core, fsm, businessId, estimateId);
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

/** The public estimate page's one read. Resolves the token first (throws
 * `PortalTokenError` if it's bad/expired/rate-limited) -- everything downstream is
 * fetched via the service-role client scoped to exactly that token's own business/
 * document, never a client-supplied id. */
export async function getPublicEstimateView(rawToken: string): Promise<PublicEstimateView> {
  const token = await resolvePortalToken(rawToken, "estimate");

  const core = createCoreAdminClient({ schema: "core" });
  const fsm = createCoreAdminClient({ schema: "fsm" });

  const [{ data: doc, error: docError }, { data: business }, { data: party }] = await Promise.all([
    core.from("documents").select(ESTIMATE_SELECT).eq("id", token.documentId).eq("business_id", token.businessId).single(),
    core.from("businesses").select("name, website").eq("id", token.businessId).maybeSingle(),
    core.from("parties").select("name").eq("id", token.partyId).maybeSingle(),
  ]);
  if (docError) throw docError;

  const estimate = toEstimate(doc);
  const lines = await loadEstimateLines(core, fsm, token.businessId, estimate.id);

  return {
    businessName: business?.name ?? "Estimate",
    businessWebsite: business?.website ?? null,
    partyName: party?.name ?? "",
    estimate,
    lines,
  };
}
