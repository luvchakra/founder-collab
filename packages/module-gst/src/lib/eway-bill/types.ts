/**
 * Non-secret status only -- mirrors `gst.eway_bill_credentials_status()`'s return shape.
 * The actual secret columns (gsp_username/gsp_password/client_id/client_secret) are
 * never queried by this module at all: no SELECT grant exists for them (see the gst
 * schema migration), so there is nothing to type for a "read the credentials" case.
 */
export type EwayBillCredentialsStatus = {
  gsp_provider: string;
  auth_url: string;
  generate_url: string;
  cancel_url: string;
  /** COMPLY-P0-06.3 (E-Way Adapter): nullable -- a business already using the existing
   * generate/cancel workflow isn't forced to configure these before that keeps working;
   * `createGspEwayBillAdapter`'s own `updateVehicle()`/`extend()`/`status()` throw a
   * clear error when unset. */
  vehicle_update_url: string | null;
  extend_url: string | null;
  status_url: string | null;
  updated_at: string;
};

/** A row in `gst.eway_bills` -- one per `core.documents` row, ever, same "no reissue"
 * simplification as `Einvoice` (einvoicing/types.ts). */
export type EwayBill = {
  id: string;
  business_id: string;
  document_id: string;
  status: "generated" | "cancelled";
  eway_bill_number: string | null;
  valid_until: string | null;
  qr_code: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};
