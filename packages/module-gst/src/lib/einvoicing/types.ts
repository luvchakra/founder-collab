/** Non-secret status only -- mirrors `gst.einvoice_credentials_status()`'s return shape.
 * See eway-bill/types.ts's own docstring for why there's nothing to type for a "read
 * the credentials" case. */
export type EinvoiceCredentialsStatus = {
  gsp_provider: string;
  auth_url: string;
  generate_url: string;
  cancel_url: string;
  /** COMPLY-P0-05.3 (IRP Adapter): the two endpoints `submit`/`cancel` never needed but
   * `status`/`fetch` do -- nullable, unlike `generate_url`/`cancel_url`, since a business
   * already using the existing generate/cancel workflow isn't forced to configure these
   * before that keeps working. */
  status_url: string | null;
  fetch_url: string | null;
  updated_at: string;
};

/** A row in `gst.einvoices` -- one per `core.documents` row, ever (S-2's own
 * generation-history table). `irn`/`ack_no`/`ack_date`/`qr_code` are null only for a row
 * this schema never actually produces (every insert this module makes already has a
 * successful GSP response in hand) -- typed nullable anyway since they're plain text
 * columns with no not-null constraint. */
export type Einvoice = {
  id: string;
  business_id: string;
  document_id: string;
  status: "generated" | "cancelled";
  irn: string | null;
  ack_no: string | null;
  ack_date: string | null;
  qr_code: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};
