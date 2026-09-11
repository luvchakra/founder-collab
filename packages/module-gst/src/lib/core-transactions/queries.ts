import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { DocumentContext, DocumentLineContext, DocumentPaymentContext } from "./types";

/**
 * COMPLY-P0-03.1 (Core Transaction Contract): "Read invoice/payment/document context from
 * Core." This is the first story of COMPLY-P0-03 (Existing-Data Integration) -- Compliance
 * reading `core.documents`/`core.document_lines`/`core.document_balances` DIRECTLY
 * (CLAUDE.md's cross-module communication rule #1: "read shared data from `core` directly
 * -- no coupling," the cheapest of the three legal mechanisms and the right one here,
 * since `core` is not another business module's own internals -- no `contract/index.ts`
 * boundary applies). No new table, no new migration: this story is purely a typed,
 * read-only accessor layer inside `module-gst`, following the exact `coreClient()` /
 * "no PostgREST embed across schemas, join in JS" pattern `module-fsm`'s own
 * `lib/jobs/queries.ts` already established for the identical cross-schema-read need.
 *
 * Runs as the authenticated user (RLS applies) -- `core.documents`/`document_lines`/
 * `document_balances` already enforce tenant isolation via their own existing RLS
 * policies (`business_id in core.user_business_ids()`), so this file adds no new
 * authorization surface; it is a read, not a write, and Core's own tables aren't gated by
 * `gst` licensing at all (a business's documents exist regardless of which modules it has
 * licensed) -- so, unlike every mutation in this module, there is deliberately no
 * `requireModule`/`requirePermission` call here, matching the same no-gate-on-reads
 * convention `lib/compliance/queries.ts`/`lib/tax-registrations/queries.ts` already use.
 */

function coreClient() {
  return createCoreClient({ schema: "core" });
}

export function mapDocumentLine(row: {
  id: string;
  item_id: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  hsn_code: string | null;
  tax_rate: number;
  taxable: boolean;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
}): DocumentLineContext {
  return {
    id: row.id,
    itemId: row.item_id,
    description: row.description,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    hsnCode: row.hsn_code,
    taxRate: row.tax_rate,
    taxable: row.taxable,
    cgstAmount: row.cgst_amount,
    sgstAmount: row.sgst_amount,
    igstAmount: row.igst_amount,
  };
}

export function mapDocument(
  row: {
    id: string;
    business_id: string;
    doc_type: string;
    party_id: string;
    number: string | null;
    status: string;
    payment_status: string | null;
    doc_date: string;
    due_date: string | null;
    subtotal: number;
    discount_amount: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    shipping_amount: number;
    total_amount: number;
  },
  lines: DocumentLineContext[],
): DocumentContext {
  return {
    id: row.id,
    businessId: row.business_id,
    docType: row.doc_type,
    partyId: row.party_id,
    number: row.number,
    status: row.status,
    paymentStatus: row.payment_status,
    docDate: row.doc_date,
    dueDate: row.due_date,
    subtotal: row.subtotal,
    discountAmount: row.discount_amount,
    cgstAmount: row.cgst_amount,
    sgstAmount: row.sgst_amount,
    igstAmount: row.igst_amount,
    shippingAmount: row.shipping_amount,
    totalAmount: row.total_amount,
    lines,
  };
}

/** A document plus its lines, for one business -- `null` if it doesn't exist or doesn't
 * belong to `businessId` (RLS would already exclude a cross-tenant row, but the explicit
 * `.eq("business_id", ...)` matches every other query function's own defense-in-depth
 * convention in this module rather than relying on RLS alone to narrow the result). */
export async function getDocumentContext(businessId: string, documentId: string): Promise<DocumentContext | null> {
  const core = await coreClient();

  const { data: doc, error } = await core
    .from("documents")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", documentId)
    .maybeSingle();
  if (error) throw error;
  if (!doc) return null;

  const { data: lineRows, error: linesError } = await core
    .from("document_lines")
    .select("*")
    .eq("business_id", businessId)
    .eq("document_id", documentId)
    .order("sort_order", { ascending: true });
  if (linesError) throw linesError;

  return mapDocument(doc, lineRows.map(mapDocumentLine));
}

/** Reads `core.document_balances` (a view, always correct against the live payment
 * allocation ledger -- never a cached total this module would have to keep in sync
 * itself). `null` if the document doesn't exist for this business. */
export async function getDocumentPaymentContext(businessId: string, documentId: string): Promise<DocumentPaymentContext | null> {
  const core = await coreClient();
  const { data, error } = await core
    .from("document_balances")
    .select("*")
    .eq("business_id", businessId)
    .eq("document_id", documentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    documentId: data.document_id,
    totalAmount: data.total_amount,
    paidAmount: data.paid_amount,
    balanceAmount: data.balance_amount,
  };
}
