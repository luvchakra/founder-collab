import { createClient } from "../../db/server";
import { getGstProfile } from "../profile/queries";
import { getPurchaseRegister, getSalesRegister } from "../filing/queries";
import { getEwayBillCredentialsStatus } from "../eway-bill/queries";
import { getEinvoiceCredentialsStatus } from "../einvoicing/queries";
import type { ComplianceDashboard } from "./types";

/** S-5's own registry-driven dashboard: this calendar month's generated e-invoice count
 * across every business the caller already knows has `gst` licensed -- see
 * `module-fsm/lib/dashboard/queries.ts#getOpenJobsCount`'s own docstring for the
 * "trusts the caller's license filtering" reasoning. */
export async function getEinvoicesThisMonthCount(businessIds: string[]): Promise<number> {
  if (businessIds.length === 0) return 0;
  const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("einvoices")
    .select("id", { count: "exact", head: true })
    .in("business_id", businessIds)
    .eq("status", "generated")
    .gte("created_at", start);
  if (error) throw error;
  return count ?? 0;
}

/**
 * `/gst`'s own dashboard (the Compliance module's new "Overview > Dashboard" nav item)
 * -- a one-screen snapshot for the current calendar month, reusing the same
 * getPurchaseRegister()/getSalesRegister() the Filing page already computes its own
 * numbers from (this just reads their totals, doesn't recompute the underlying
 * documents query). GSTIN risk here is "how many suppliers/customers this month have a
 * missing/invalid GSTIN," the same input-tax-credit/filing-accuracy concern
 * inventory's own dashboard already surfaces on the purchase side alone.
 */
export async function getComplianceDashboard(businessId: string): Promise<ComplianceDashboard> {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const start = `${period}-01`;
  const end = `${period}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;

  const [profile, purchaseRegister, salesRegister, einvoicesThisMonth, ewayStatus, einvStatus] = await Promise.all([
    getGstProfile(businessId),
    getPurchaseRegister(businessId, start, end),
    getSalesRegister(businessId, start, end),
    getEinvoicesThisMonthCount([businessId]),
    getEwayBillCredentialsStatus(businessId),
    getEinvoiceCredentialsStatus(businessId),
  ]);

  const purchaseRiskCount = purchaseRegister.bySupplier.filter((s) => s.risk !== "none").length;
  const salesRiskCount = salesRegister.missingGstinCount + salesRegister.invalidGstinCount;

  return {
    gstin: profile?.gstin ?? null,
    period,
    payableThisMonth: purchaseRegister.totalTax,
    collectedThisMonth: salesRegister.totalTax,
    cgstCollected: salesRegister.cgst,
    sgstCollected: salesRegister.sgst,
    igstCollected: salesRegister.igst,
    einvoicesThisMonth,
    riskCount: purchaseRiskCount + salesRiskCount,
    ewayBillConfigured: Boolean(ewayStatus),
    einvoiceConfigured: Boolean(einvStatus),
  };
}
