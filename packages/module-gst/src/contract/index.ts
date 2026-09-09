import { hasModule } from "@cofounderai/core/licensing/queries";
import { inr } from "@cofounderai/core/lib/format";
import { getEinvoiceForDocument } from "../lib/einvoicing/queries";
import { generateEinvoice, cancelEinvoice } from "../lib/einvoicing/mutations";
import { getEwayBillForDocument } from "../lib/eway-bill/queries";
import { generateEwayBill, cancelEwayBill } from "../lib/eway-bill/mutations";
import { getComplianceDashboard } from "../lib/dashboard/queries";
import type { ContractEinvoice, ContractEwayBill, ContractGstDocumentStatus, ContractResult } from "./types";
import type { ShellAlert } from "@cofounderai/core/shell/types";

/**
 * module-gst's public API surface (00-MASTER-PLAN.md §6 mechanism 2; the first
 * `contract/index.ts` this module has, mirroring module-fsm's/module-inventory's own
 * first ones from F-13/SP-9) -- the ONLY thing another module (or `apps/web`, though
 * that's exempt from the restriction) should reach for `gst`'s own generation-history
 * feature (S-2). Every function here checks `hasModule(businessId, 'gst')` itself, same
 * pattern module-inventory's contract already established, so a caller never needs its
 * own separate license check before calling in.
 */

async function requireLicensed(businessId: string): Promise<"MODULE_NOT_LICENSED" | null> {
  const licensed = await hasModule(businessId, "gst");
  return licensed ? null : "MODULE_NOT_LICENSED";
}

function toContractEinvoice(row: { status: string; irn: string | null; ack_no: string | null; ack_date: string | null; qr_code: string | null } | null): ContractEinvoice | null {
  if (!row) return null;
  return { status: row.status as "generated" | "cancelled", irn: row.irn, ackNo: row.ack_no, ackDate: row.ack_date, qrCode: row.qr_code };
}

function toContractEwayBill(row: { status: string; eway_bill_number: string | null; valid_until: string | null; qr_code: string | null } | null): ContractEwayBill | null {
  if (!row) return null;
  return { status: row.status as "generated" | "cancelled", ewayBillNumber: row.eway_bill_number, validUntil: row.valid_until, qrCode: row.qr_code };
}

/** The e-invoice/e-way-bill status of one `core.documents` row -- for any module's own
 * invoice detail view to render alongside its own fields (FSM's invoice detail page is
 * this contract's first caller). Both are independently null when nothing has been
 * generated yet, which is the common case in this demo platform (no GST credentials
 * configured). */
export async function getGstDocumentStatus(businessId: string, documentId: string): Promise<ContractResult<ContractGstDocumentStatus>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const [einvoice, ewayBill] = await Promise.all([
    getEinvoiceForDocument(businessId, documentId),
    getEwayBillForDocument(businessId, documentId),
  ]);
  return { ok: true, data: { einvoice: toContractEinvoice(einvoice), ewayBill: toContractEwayBill(ewayBill) } };
}

export async function generateDocumentEinvoice(businessId: string, documentId: string): Promise<ContractResult<ContractEinvoice>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  try {
    const row = await generateEinvoice(businessId, documentId);
    return { ok: true, data: toContractEinvoice(row)! };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function cancelDocumentEinvoice(businessId: string, documentId: string, reason?: string): Promise<ContractResult<ContractEinvoice>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  try {
    const row = await cancelEinvoice(businessId, documentId, reason);
    return { ok: true, data: toContractEinvoice(row)! };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function generateDocumentEwayBill(businessId: string, documentId: string): Promise<ContractResult<ContractEwayBill>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  try {
    const row = await generateEwayBill(businessId, documentId);
    return { ok: true, data: toContractEwayBill(row)! };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function cancelDocumentEwayBill(businessId: string, documentId: string, reason?: string): Promise<ContractResult<ContractEwayBill>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  try {
    const row = await cancelEwayBill(businessId, documentId, reason);
    return { ok: true, data: toContractEwayBill(row)! };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * A short plain-language snapshot of this business's GST/Compliance position -- what
 * the AI assistant grounds itself in when the founder is looking at Compliance, or has
 * opted into "consult all modules." Reuses getComplianceDashboard() (the /gst
 * dashboard's own read model) rather than a second aggregation.
 */
export async function getChatContextSummary(businessId: string): Promise<ContractResult<string>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const dashboard = await getComplianceDashboard(businessId);
  const lines = [
    dashboard.gstin ? `Compliance: GSTIN ${dashboard.gstin} on file.` : "Compliance: no GST profile set up yet.",
    `Payable this month: ${inr.format(dashboard.payableThisMonth)}. Collected this month: ${inr.format(dashboard.collectedThisMonth)}.`,
    dashboard.riskCount > 0
      ? `${dashboard.riskCount} supplier/customer this month with a missing or invalid GSTIN.`
      : "No GSTIN risk flagged this month.",
  ];
  return { ok: true, data: lines.join(" ") };
}

/** Topbar alert-bell entry for this business's GST/Compliance risk -- see
 * module-inventory/contract/index.ts#getAlerts's own doc comment for why `ShellAlert`
 * is core-owned. */
export async function getAlerts(businessId: string): Promise<ContractResult<ShellAlert[]>> {
  const licenseError = await requireLicensed(businessId);
  if (licenseError) return { ok: false, error: licenseError };

  const dashboard = await getComplianceDashboard(businessId);
  if (dashboard.riskCount === 0) return { ok: true, data: [] };

  return {
    ok: true,
    data: [
      {
        id: `gst-risk-${businessId}`,
        severity: "warning",
        message: `${dashboard.riskCount} supplier/customer this month with a missing or invalid GSTIN.`,
        href: `/dashboard/businesses/${businessId}/gst/filing`,
      },
    ],
  };
}
