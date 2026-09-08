import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { aggregateGst, computeLineGst, resolveStateCode } from "@cofounderai/core/lib/gst";
import type { Opportunity } from "../opportunities/types";
import type { AddChargeLineInput, UpdateChargeLineInput } from "./types";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** One estimate document per opportunity (MUST scope -- "multiple estimate options" is
 * explicitly a SHOULD/LATER item in the PRD). Creates a draft the first time this
 * opportunity is estimated; returns the existing one on every call after. */
export async function getOrCreateEstimate(businessId: string, opportunity: Opportunity): Promise<string> {
  const core = await coreClient();
  const { data: existing, error: findError } = await core
    .from("documents")
    .select("id")
    .eq("business_id", businessId)
    .eq("doc_type", "estimate")
    .eq("source_module", "fsm")
    .contains("source_ref", { opportunity_id: opportunity.id })
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id;

  const { data, error } = await core
    .from("documents")
    .insert({
      business_id: businessId,
      doc_type: "estimate",
      source_module: "fsm",
      source_ref: { opportunity_id: opportunity.id },
      party_id: opportunity.party_id,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Recomputes every line's CGST/SGST/IGST server-side from the business's own GST
 * profile and the customer's state/GSTIN (never trusting client-computed tax amounts for
 * a financial document), then persists both the recomputed line amounts and the
 * document's own aggregated totals -- same approach as module-inventory's own
 * purchase-orders/mutations.ts#computeTotals, adapted to write back to `core.documents`
 * directly instead of returning to an insert-time caller, since a charge line can be
 * added/edited/removed at any point after the estimate document already exists. */
async function recomputeAndPersistTotals(businessId: string, estimateId: string): Promise<void> {
  const core = await coreClient();

  const { data: doc, error: docError } = await core
    .from("documents")
    .select("party_id, discount_amount, shipping_amount")
    .eq("id", estimateId)
    .single();
  if (docError) throw docError;

  const [{ data: settings }, { data: taxIdentity }, { data: lines, error: linesError }] = await Promise.all([
    core.from("business_settings").select("gstin, state").eq("business_id", businessId).maybeSingle(),
    core.from("tax_identities").select("gstin, state").eq("party_id", doc.party_id).maybeSingle(),
    core.from("document_lines").select("id, quantity, unit_price, tax_rate, taxable").eq("document_id", estimateId),
  ]);
  if (linesError) throw linesError;

  const sellerStateCode = resolveStateCode(settings?.state ?? null, settings?.gstin ?? null);
  const buyerStateCode = resolveStateCode(taxIdentity?.state ?? null, taxIdentity?.gstin ?? null);

  const breakups = lines.map((l) =>
    computeLineGst({
      taxableValue: l.taxable ? Number(l.quantity) * Number(l.unit_price) : 0,
      gstRatePercent: l.taxable ? Number(l.tax_rate) : 0,
      sellerStateCode,
      buyerStateCode,
    }),
  );

  await Promise.all(
    lines.map((l, i) =>
      core
        .from("document_lines")
        .update({ cgst_amount: breakups[i]!.cgstAmount, sgst_amount: breakups[i]!.sgstAmount, igst_amount: breakups[i]!.igstAmount })
        .eq("id", l.id),
    ),
  );

  const totals = aggregateGst(breakups);
  const subtotal = lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_price), 0);
  const total = subtotal + totals.totalTax + Number(doc.shipping_amount) - Number(doc.discount_amount);

  const { error: updateError } = await core
    .from("documents")
    .update({
      subtotal,
      cgst_amount: totals.cgstAmount,
      sgst_amount: totals.sgstAmount,
      igst_amount: totals.igstAmount,
      total_amount: total,
    })
    .eq("id", estimateId);
  if (updateError) throw updateError;
}

/** Resolves `input`'s item -- either the existing one given, or a brand-new
 * `core.items` row created inline (PRD §2's "ad-hoc lines"). An ad-hoc charge isn't a
 * distinct data-model concept: Kickserv items/StockPilot products/FSM charge items are
 * one `core.items` table (entity-ownership map), so "ad-hoc" just means "create the item
 * inline" rather than "pick one that already exists in the catalog." */
async function resolveItemId(businessId: string, input: AddChargeLineInput): Promise<{ itemId: string; taxRate: number; unitPrice: number }> {
  if (input.itemId) {
    const core = await coreClient();
    const { data: item, error } = await core.from("items").select("tax_rate, selling_price").eq("id", input.itemId).single();
    if (error) throw error;
    return { itemId: input.itemId, taxRate: Number(item.tax_rate), unitPrice: Number(item.selling_price) };
  }
  if (!input.adHoc?.name.trim()) {
    throw new Error("A catalog item or a name for a new ad-hoc charge is required.");
  }
  const core = await coreClient();
  const { data: item, error } = await core
    .from("items")
    .insert({
      business_id: businessId,
      kind: "service",
      name: input.adHoc.name.trim(),
      tax_rate: input.adHoc.taxRate,
      selling_price: input.adHoc.unitPrice,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { itemId: item.id, taxRate: input.adHoc.taxRate, unitPrice: input.adHoc.unitPrice };
}

export async function addChargeLine(businessId: string, estimateId: string, input: AddChargeLineInput): Promise<void> {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error("Quantity must be positive.");

  const { itemId, taxRate, unitPrice } = await resolveItemId(businessId, input);
  const core = await coreClient();

  const { data: item } = await core.from("items").select("hsn_code").eq("id", itemId).maybeSingle();
  const { data: maxSort } = await core
    .from("document_lines")
    .select("sort_order")
    .eq("document_id", estimateId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await core.from("document_lines").insert({
    business_id: businessId,
    document_id: estimateId,
    item_id: itemId,
    quantity: input.quantity,
    unit_price: unitPrice,
    tax_rate: taxRate,
    taxable: input.taxable,
    hsn_code: item?.hsn_code ?? null,
    job_charge_type_id: input.jobChargeTypeId || null,
    sort_order: (maxSort?.sort_order ?? -1) + 1,
  });
  if (error) throw error;

  await recomputeAndPersistTotals(businessId, estimateId);
}

export async function updateChargeLine(businessId: string, estimateId: string, lineId: string, patch: UpdateChargeLineInput): Promise<void> {
  const core = await coreClient();
  const update: Record<string, unknown> = {};
  if ("quantity" in patch) update.quantity = patch.quantity;
  if ("unitPrice" in patch) update.unit_price = patch.unitPrice;
  if ("taxable" in patch) update.taxable = patch.taxable;
  if ("jobChargeTypeId" in patch) update.job_charge_type_id = patch.jobChargeTypeId;

  const { error } = await core.from("document_lines").update(update).eq("id", lineId).eq("document_id", estimateId);
  if (error) throw error;

  await recomputeAndPersistTotals(businessId, estimateId);
}

export async function deleteChargeLine(businessId: string, estimateId: string, lineId: string): Promise<void> {
  const core = await coreClient();
  const { error } = await core.from("document_lines").delete().eq("id", lineId).eq("document_id", estimateId);
  if (error) throw error;

  await recomputeAndPersistTotals(businessId, estimateId);
}

/** Drag-to-reorder (PRD §1: "reorderable by drag handle") -- `orderedLineIds` is the new
 * full order, front to back. */
export async function reorderChargeLines(estimateId: string, orderedLineIds: string[]): Promise<void> {
  const core = await coreClient();
  await Promise.all(
    orderedLineIds.map((lineId, index) =>
      core.from("document_lines").update({ sort_order: index }).eq("id", lineId).eq("document_id", estimateId),
    ),
  );
}
