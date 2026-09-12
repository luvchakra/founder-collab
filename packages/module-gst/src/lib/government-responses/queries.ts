import { listEinvoicesForBusiness } from "../einvoicing/queries";
import { listEwayBillsForBusiness } from "../eway-bill/queries";
import { sortGovernmentResponses } from "./sort";
import type { GovernmentResponseRecord } from "./types";

/**
 * COMPLY-P0-10.2 (Government Response Store): "the future story that builds a real,
 * purpose-built evidence view around" `gst.einvoices.raw_response`, per that column's
 * own migration comment (`20260912030000_gst_einvoices_raw_response.sql`) -- this is that
 * view. A read-only assembly over data COMPLY-P0-05.4 (e-invoices) and this story's own
 * `20260912210000_gst_eway_bills_raw_response.sql` (e-way bills, the same gap on the
 * sibling table, closed the same way) already persist -- no new table.
 *
 * **Scope, deliberately narrowed to e-invoice/e-way-bill GENERATE responses (backlog rule
 * 5)** -- NOT `gst.gstr2b_statements.raw` (COMPLY-P0-08.1's own downloaded/fetched GSTR-2B
 * statement JSON): that is a different kind of government artifact (a bulk periodic
 * statement a business imports, not a per-submission API response this platform's own
 * adapter received), already reachable through COMPLY-P0-08's own reconciliation screens
 * once COMPLY-P0-11 builds them. Folding it into this same list would blur two genuinely
 * different "government document" concepts together for no real benefit.
 *
 * **Cancel responses are never included, for a real, structural reason, not an
 * oversight**: `IrpAdapter.cancel()`/`EwayBillAdapter.cancel()` both return `Promise<void>`
 * -- there is no response body for either mutation to have captured in the first place
 * (see `lib/eway-bill/mutations.ts#cancelEwayBill`'s own docstring, mirroring
 * `lib/einvoice-status/determine.ts`'s own already-documented gap for the identical
 * reason). A `"cancelled"` record in this list's own `rawResponse` is always the
 * GENERATE response (still real, still evidence of what the IRP/NIC originally
 * returned), never a cancel confirmation.
 */
export async function listGovernmentResponses(businessId: string): Promise<GovernmentResponseRecord[]> {
  const [einvoices, ewayBills] = await Promise.all([listEinvoicesForBusiness(businessId), listEwayBillsForBusiness(businessId)]);

  const records: GovernmentResponseRecord[] = [
    ...einvoices.map((row) => ({
      source: "einvoice" as const,
      documentId: row.document_id,
      recordId: row.id,
      status: row.status,
      rawResponse: row.raw_response,
      receivedAt: row.created_at,
    })),
    ...ewayBills.map((row) => ({
      source: "eway_bill" as const,
      documentId: row.document_id,
      recordId: row.id,
      status: row.status,
      rawResponse: row.raw_response,
      receivedAt: row.created_at,
    })),
  ];

  return sortGovernmentResponses(records);
}
