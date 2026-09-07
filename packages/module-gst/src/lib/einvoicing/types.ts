/** Non-secret status only -- mirrors `gst.einvoice_credentials_status()`'s return shape.
 * See eway-bill/types.ts's own docstring for why there's nothing to type for a "read
 * the credentials" case. */
export type EinvoiceCredentialsStatus = {
  gsp_provider: string;
  auth_url: string;
  generate_url: string;
  cancel_url: string;
  updated_at: string;
};
