/**
 * COMPLY-P0-10.2 (Government Response Store). See `queries.ts`'s own docstring for scope
 * (e-invoice/e-way-bill GENERATE responses only -- not GSTR-2B's own downloaded-statement
 * JSON, a different kind of government document COMPLY-P0-08.1 already handles its own
 * way).
 */
export type GovernmentResponseSource = "einvoice" | "eway_bill";

export type GovernmentResponseRecord = {
  source: GovernmentResponseSource;
  documentId: string;
  /** The `gst.einvoices`/`gst.eway_bills` row this response belongs to. */
  recordId: string;
  status: "generated" | "cancelled";
  /** The complete, unmodified body the government/GSP actually returned -- `null` when
   * this row predates COMPLY-P0-05.4/10.2's own `raw_response` columns, or (always, for
   * now) when this is a cancellation -- see `queries.ts`'s own docstring. */
  rawResponse: Record<string, unknown> | null;
  receivedAt: string;
};
