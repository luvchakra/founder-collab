import { cache } from "react";
import { getStockValuation } from "@cofounderai/module-inventory/contract/index";
import { createClient } from "../../db/server";
import { profitAndLoss } from "../accounting/reports";
import { getStatementTotals } from "../accounting/report-queries";
import {
  grossMargin,
  splitSalesByItem,
  summarisePurchases,
  valueInventory,
  type GrossMargin,
  type InventoryValuation,
  type PurchaseByPartyRow,
  type PurchaseSummary,
  type SalesByItemRow,
  type SalesByItemSplit,
  type SalesByPartyRow,
} from "./derive";
import type { StatementLine } from "../accounting/reports";

type Num = number | string | null;
const num = (v: Num) => Number(v ?? 0);

/** FIN-6: net sales per customer for a period (`gst.sales_by_party`). */
export const getSalesByParty = cache(async (businessId: string, from: string, to: string): Promise<SalesByPartyRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sales_by_party", { p_business_id: businessId, p_from: from, p_to: to });
  if (error) throw error;
  type Row = { party_id: string; party_name: string; document_count: Num; taxable_value: Num; tax: Num; total: Num };
  return ((data ?? []) as Row[]).map((r) => ({
    partyId: r.party_id,
    partyName: r.party_name,
    documentCount: num(r.document_count),
    taxableValue: num(r.taxable_value),
    tax: num(r.tax),
    total: num(r.total),
  }));
});

/** FIN-6: net sales per item, split into products and services (`gst.sales_by_item`). */
export const getSalesByItem = cache(async (businessId: string, from: string, to: string): Promise<SalesByItemSplit> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sales_by_item", { p_business_id: businessId, p_from: from, p_to: to });
  if (error) throw error;
  type Row = { item_id: string | null; item_name: string | null; item_kind: string | null; sku: string | null; quantity: Num; sales_value: Num };
  const rows: SalesByItemRow[] = ((data ?? []) as Row[]).map((r) => ({
    itemId: r.item_id,
    itemName: r.item_name,
    itemKind: r.item_kind,
    sku: r.sku,
    quantity: r.quantity === null ? null : num(r.quantity),
    salesValue: num(r.sales_value),
  }));
  return splitSalesByItem(rows);
});

/** FIN-6: bills and expenses per supplier (`gst.purchases_by_party`). */
export const getPurchaseSummary = cache(async (businessId: string, from: string, to: string): Promise<PurchaseSummary> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("purchases_by_party", { p_business_id: businessId, p_from: from, p_to: to });
  if (error) throw error;
  type Row = { party_id: string; party_name: string; kind: string; document_count: Num; taxable_value: Num; tax: Num; total: Num };
  const rows: PurchaseByPartyRow[] = ((data ?? []) as Row[]).map((r) => ({
    partyId: r.party_id,
    partyName: r.party_name,
    kind: r.kind === "expense" ? "expense" : "bill",
    documentCount: num(r.document_count),
    taxableValue: num(r.taxable_value),
    tax: num(r.tax),
    total: num(r.total),
  }));
  return summarisePurchases(rows);
});

export interface LedgerOperationalFigures {
  cogs: StatementLine[];
  expensesByCategory: StatementLine[];
  margin: GrossMargin;
}

/** FIN-6: COGS, gross margin and expenses by category, from the same ledger read the
 * profit and loss uses — so these figures can never disagree with the statement. */
export async function getLedgerOperationalFigures(businessId: string, from: string, to: string): Promise<LedgerOperationalFigures> {
  const pl = profitAndLoss(await getStatementTotals(businessId, from, to));
  return { cogs: pl.cogs, expensesByCategory: pl.expenses, margin: grossMargin(pl) };
}

export type InventoryValuationResult =
  | { available: true; valuation: InventoryValuation }
  | { available: false; reason: "not_licensed" | "no_cost_permission" | "error"; message: string };

/**
 * FIN-6: stock at cost, through module-inventory's contract — the only way Finance may
 * read stock (ADR-10). `MODULE_NOT_LICENSED` and `FORBIDDEN` are normal answers, turned
 * into a plain sentence for the page rather than an error: a Finance-only business simply
 * has no stock to value.
 */
export async function getInventoryValuation(businessId: string): Promise<InventoryValuationResult> {
  const result = await getStockValuation(businessId);
  if (result.ok) return { available: true, valuation: valueInventory(result.data) };
  if (result.error === "MODULE_NOT_LICENSED") {
    return { available: false, reason: "not_licensed", message: "Stock is valued by Inventory, which isn't part of this business's plan. Everything else on this page works without it." };
  }
  if (result.error === "FORBIDDEN") {
    return { available: false, reason: "no_cost_permission", message: "Your role can't see stock costs, so the valuation isn't shown. Ask an owner or admin for the inventory cost permission." };
  }
  return { available: false, reason: "error", message: "Stock couldn't be read just now. Try again in a moment." };
}
