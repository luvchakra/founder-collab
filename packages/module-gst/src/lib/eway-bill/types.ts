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
  updated_at: string;
};
