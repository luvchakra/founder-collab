"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { upsertEinvoiceCredentials } from "@cofounderai/module-gst/lib/einvoicing/mutations";
import type { EinvoicingActionState } from "@cofounderai/module-gst/components/einvoicing/einvoicing-form";

export async function saveEinvoiceCredentialsAction(
  businessId: string,
  _prevState: EinvoicingActionState,
  formData: FormData,
): Promise<EinvoicingActionState> {
  const gsp_provider = String(formData.get("gsp_provider") ?? "").trim();
  const auth_url = String(formData.get("auth_url") ?? "").trim();
  const generate_url = String(formData.get("generate_url") ?? "").trim();
  const cancel_url = String(formData.get("cancel_url") ?? "").trim();
  if (!gsp_provider) return { error: "GSP provider name is required." };
  if (!auth_url) return { error: "Auth URL is required." };
  if (!generate_url) return { error: "Generate URL is required." };
  if (!cancel_url) return { error: "Cancel URL is required." };

  try {
    await requirePermission(businessId, "settings.manage");
    await upsertEinvoiceCredentials(businessId, {
      gsp_provider,
      auth_url,
      generate_url,
      cancel_url,
      status_url: String(formData.get("status_url") ?? "").trim() || null,
      fetch_url: String(formData.get("fetch_url") ?? "").trim() || null,
      gsp_username: String(formData.get("gsp_username") ?? "").trim() || null,
      gsp_password: String(formData.get("gsp_password") ?? "").trim() || null,
      client_id: String(formData.get("client_id") ?? "").trim() || null,
      client_secret: String(formData.get("client_secret") ?? "").trim() || null,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save e-Invoicing credentials." };
  }

  revalidatePath(`/dashboard/businesses/${businessId}/gst/einvoicing`);
  return { success: true };
}
