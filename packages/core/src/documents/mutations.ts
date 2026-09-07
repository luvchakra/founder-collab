import { createClient } from "../db/server";
import type { DocType, Document, DocumentLine } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

export async function createDocument(input: {
  businessId: string;
  docType: DocType;
  sourceModule: string;
  sourceRef?: Record<string, unknown>;
  partyId: string;
  number?: string | null;
  docDate?: string;
  dueDate?: string | null;
  expectedDate?: string | null;
  reason?: string | null;
  notes?: string | null;
  discountAmount?: number;
  shippingAmount?: number;
}): Promise<Document> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("documents")
    .insert({
      business_id: input.businessId,
      doc_type: input.docType,
      source_module: input.sourceModule,
      source_ref: input.sourceRef ?? {},
      party_id: input.partyId,
      number: input.number ?? null,
      doc_date: input.docDate ?? undefined,
      due_date: input.dueDate ?? null,
      expected_date: input.expectedDate ?? null,
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      discount_amount: input.discountAmount ?? 0,
      shipping_amount: input.shippingAmount ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Adds a line and snapshots its tax fields at this moment -- pass `hsnCode`/`taxRate`
 * explicitly, or omit them to copy the item's current values once at creation. Either
 * way, core.document_lines never re-reads core.items after this insert (03-STOCKPILOT-
 * MIGRATION.md: "historical documents must not change when a price or rate changes").
 */
export async function addDocumentLine(input: {
  businessId: string;
  documentId: string;
  itemId: string;
  description?: string | null;
  quantity: number;
  unitPrice?: number;
  hsnCode?: string | null;
  taxRate?: number;
  taxable?: boolean;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  sortOrder?: number;
}): Promise<DocumentLine> {
  const supabase = await coreClient();

  let hsnCode = input.hsnCode;
  let taxRate = input.taxRate;
  if (hsnCode === undefined || taxRate === undefined) {
    const { data: item, error: itemError } = await supabase
      .from("items")
      .select("hsn_code, tax_rate")
      .eq("id", input.itemId)
      .single();
    if (itemError) throw itemError;
    hsnCode = hsnCode ?? item.hsn_code;
    taxRate = taxRate ?? item.tax_rate;
  }

  const { data, error } = await supabase
    .from("document_lines")
    .insert({
      business_id: input.businessId,
      document_id: input.documentId,
      item_id: input.itemId,
      description: input.description ?? null,
      quantity: input.quantity,
      unit_price: input.unitPrice ?? 0,
      hsn_code: hsnCode ?? null,
      tax_rate: taxRate ?? 0,
      taxable: input.taxable ?? true,
      cgst_amount: input.cgstAmount ?? 0,
      sgst_amount: input.sgstAmount ?? 0,
      igst_amount: input.igstAmount ?? 0,
      sort_order: input.sortOrder ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
