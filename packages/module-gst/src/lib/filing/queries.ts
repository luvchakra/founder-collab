import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { isValidGstin } from "@cofounderai/core/lib/gst";
import type {
  B2BInvoiceRow,
  B2CRegisterRow,
  BusinessGstFilingProfile,
  GstinRisk,
  HsnRegisterRow,
  PurchaseRegister,
  SalesCreditNoteRow,
  SalesRegister,
  SupplierRegisterRow,
} from "./types";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

export const getBusinessGstFilingProfile = cache(async (businessId: string): Promise<BusinessGstFilingProfile> => {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("business_settings")
    .select("gstin, gst_registration_type")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw error;
  return { gstin: data?.gstin ?? null, gst_registration_type: data?.gst_registration_type ?? "regular" };
});

/** Ported from stockpilot-ai-ops's gst-filing.tsx purchase-register useQuery + its
 * supplier-wise/HSN-wise summary computation, read from `core.documents`/`core.
 * document_lines` directly (source_module='inventory', doc_type='purchase_order')
 * rather than through module-inventory's own compat views -- see this file's own
 * top-of-file docstring for why that's the correct boundary, not a shortcut. */
export const getPurchaseRegister = cache(
  async (businessId: string, start: string, end: string): Promise<PurchaseRegister> => {
    const supabase = await coreClient();
    const { data: pos, error: posError } = await supabase
      .from("documents")
      .select("id, number, doc_date, party_id, subtotal, cgst_amount, sgst_amount, igst_amount")
      .eq("business_id", businessId)
      .eq("source_module", "inventory")
      .eq("doc_type", "purchase_order")
      .gte("doc_date", start)
      .lte("doc_date", end)
      .order("doc_date");
    if (posError) throw posError;

    const partyIds = [...new Set(pos.map((po) => po.party_id).filter((id): id is string => !!id))];
    const [partiesRes, taxIdsRes] = await Promise.all([
      partyIds.length ? supabase.from("parties").select("id, name").in("id", partyIds) : Promise.resolve({ data: [], error: null }),
      partyIds.length ? supabase.from("tax_identities").select("party_id, gstin").in("party_id", partyIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (partiesRes.error) throw partiesRes.error;
    if (taxIdsRes.error) throw taxIdsRes.error;
    const partyNameById = new Map(partiesRes.data.map((p) => [p.id, p.name]));
    const gstinByPartyId = new Map(taxIdsRes.data.map((t) => [t.party_id, t.gstin]));

    const poIds = pos.map((po) => po.id);
    const { data: lines, error: linesError } = poIds.length
      ? await supabase.from("document_lines").select("document_id, item_id, quantity, unit_price, cgst_amount, sgst_amount, igst_amount").in("document_id", poIds)
      : { data: [], error: null };
    if (linesError) throw linesError;

    const itemIds = [...new Set(lines.map((l) => l.item_id))];
    const { data: items, error: itemsError } = itemIds.length
      ? await supabase.from("items").select("id, hsn_code").in("id", itemIds)
      : { data: [], error: null };
    if (itemsError) throw itemsError;
    const hsnByItemId = new Map(items.map((i) => [i.id, i.hsn_code]));

    const linesByPo = new Map<string, typeof lines>();
    for (const line of lines) {
      const arr = linesByPo.get(line.document_id) ?? [];
      arr.push(line);
      linesByPo.set(line.document_id, arr);
    }

    let taxableValue = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    const bySupplier = new Map<string, SupplierRegisterRow>();
    const byHsn = new Map<string, HsnRegisterRow>();
    const csvRows: PurchaseRegister["csvRows"] = [];

    for (const po of pos) {
      taxableValue += Number(po.subtotal);
      cgst += Number(po.cgst_amount);
      sgst += Number(po.sgst_amount);
      igst += Number(po.igst_amount);

      const supplierName = (po.party_id && partyNameById.get(po.party_id)) || "Unknown supplier";
      const gstin = po.party_id ? gstinByPartyId.get(po.party_id) ?? null : null;
      const risk: GstinRisk = !gstin ? "missing" : !isValidGstin(gstin) ? "invalid" : "none";
      const supKey = `${supplierName}|${gstin ?? ""}`;
      const supEntry = bySupplier.get(supKey) ?? { name: supplierName, gstin, taxableValue: 0, tax: 0, risk };
      supEntry.taxableValue += Number(po.subtotal);
      supEntry.tax += Number(po.cgst_amount) + Number(po.sgst_amount) + Number(po.igst_amount);
      bySupplier.set(supKey, supEntry);

      for (const line of linesByPo.get(po.id) ?? []) {
        const hsn = hsnByItemId.get(line.item_id) || "Unassigned";
        const lineTaxable = Number(line.quantity) * Number(line.unit_price);
        const lineTax = Number(line.cgst_amount) + Number(line.sgst_amount) + Number(line.igst_amount);
        const hsnEntry = byHsn.get(hsn) ?? { hsn, taxableValue: 0, tax: 0 };
        hsnEntry.taxableValue += lineTaxable;
        hsnEntry.tax += lineTax;
        byHsn.set(hsn, hsnEntry);
      }

      csvRows.push({
        po_number: po.number,
        order_date: po.doc_date,
        supplier_name: supplierName,
        supplier_gstin: gstin,
        subtotal: Number(po.subtotal),
        cgst: Number(po.cgst_amount),
        sgst: Number(po.sgst_amount),
        igst: Number(po.igst_amount),
        gstinStatus: !gstin
          ? "No GSTIN — likely unregistered, check reverse charge"
          : !isValidGstin(gstin)
            ? "Invalid GSTIN — verify with supplier"
            : "OK",
      });
    }

    return {
      poCount: pos.length,
      poIds: pos.map((po) => po.id),
      taxableValue,
      cgst,
      sgst,
      igst,
      totalTax: cgst + sgst + igst,
      bySupplier: [...bySupplier.values()].sort((a, b) => b.tax - a.tax),
      byHsn: [...byHsn.values()].sort((a, b) => b.tax - a.tax),
      csvRows,
    };
  },
);

/** Ported from stockpilot-ai-ops's gst-filing.tsx sales-register useQuery + its
 * B2B/B2C/HSN-wise/credit-note summary computation. */
export const getSalesRegister = cache(
  async (businessId: string, start: string, end: string): Promise<SalesRegister> => {
    const supabase = await coreClient();
    const { data: invoices, error: invoicesError } = await supabase
      .from("documents")
      .select("id, number, doc_date, party_id, subtotal, cgst_amount, sgst_amount, igst_amount")
      .eq("business_id", businessId)
      .eq("source_module", "inventory")
      .eq("doc_type", "invoice")
      .gte("doc_date", start)
      .lte("doc_date", end)
      .order("doc_date");
    if (invoicesError) throw invoicesError;

    const partyIds = [...new Set(invoices.map((inv) => inv.party_id).filter((id): id is string => !!id))];
    const [partiesRes, taxIdsRes, addressesRes] = await Promise.all([
      partyIds.length ? supabase.from("parties").select("id, name").in("id", partyIds) : Promise.resolve({ data: [], error: null }),
      partyIds.length ? supabase.from("tax_identities").select("party_id, gstin").in("party_id", partyIds) : Promise.resolve({ data: [], error: null }),
      partyIds.length
        ? supabase.from("addresses").select("party_id, state").in("party_id", partyIds).eq("kind", "billing").eq("is_primary", true)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (partiesRes.error) throw partiesRes.error;
    if (taxIdsRes.error) throw taxIdsRes.error;
    if (addressesRes.error) throw addressesRes.error;
    const partyNameById = new Map(partiesRes.data.map((p) => [p.id, p.name]));
    const gstinByPartyId = new Map(taxIdsRes.data.map((t) => [t.party_id, t.gstin]));
    const stateByPartyId = new Map(addressesRes.data.map((a) => [a.party_id, a.state]));

    const invoiceIds = invoices.map((inv) => inv.id);
    const { data: lines, error: linesError } = invoiceIds.length
      ? await supabase.from("document_lines").select("document_id, hsn_code, quantity, unit_price, cgst_amount, sgst_amount, igst_amount").in("document_id", invoiceIds)
      : { data: [], error: null };
    if (linesError) throw linesError;
    const linesByInvoice = new Map<string, typeof lines>();
    for (const line of lines) {
      const arr = linesByInvoice.get(line.document_id) ?? [];
      arr.push(line);
      linesByInvoice.set(line.document_id, arr);
    }

    const { data: creditNotesRaw, error: creditNotesError } = await supabase
      .from("documents")
      .select("id, number, doc_date, source_ref, subtotal, cgst_amount, sgst_amount, igst_amount")
      .eq("business_id", businessId)
      .eq("source_module", "inventory")
      .eq("doc_type", "credit_note")
      .gte("doc_date", start)
      .lte("doc_date", end)
      .order("doc_date");
    if (creditNotesError) throw creditNotesError;
    const invoiceNumberById = new Map(invoices.map((inv) => [inv.id, inv.number]));

    let taxableValue = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    let missingGstinCount = 0;
    let invalidGstinCount = 0;
    const b2b: B2BInvoiceRow[] = [];
    const b2c = new Map<string, B2CRegisterRow>();
    const byHsn = new Map<string, HsnRegisterRow>();

    for (const inv of invoices) {
      taxableValue += Number(inv.subtotal);
      cgst += Number(inv.cgst_amount);
      sgst += Number(inv.sgst_amount);
      igst += Number(inv.igst_amount);

      const gstin = inv.party_id ? gstinByPartyId.get(inv.party_id) ?? null : null;
      const customerName = (inv.party_id && partyNameById.get(inv.party_id)) || "Unknown customer";
      const isB2B = !!gstin && isValidGstin(gstin);
      if (isB2B) {
        b2b.push({
          invoiceNumber: inv.number,
          invoiceDate: inv.doc_date,
          customerName,
          gstin: gstin!,
          taxableValue: Number(inv.subtotal),
          cgst: Number(inv.cgst_amount),
          sgst: Number(inv.sgst_amount),
          igst: Number(inv.igst_amount),
        });
      } else {
        if (!gstin) missingGstinCount++;
        else invalidGstinCount++;
        const state = (inv.party_id && stateByPartyId.get(inv.party_id)) || "Unknown";
        const entry = b2c.get(state) ?? { state, taxableValue: 0, tax: 0 };
        entry.taxableValue += Number(inv.subtotal);
        entry.tax += Number(inv.cgst_amount) + Number(inv.sgst_amount) + Number(inv.igst_amount);
        b2c.set(state, entry);
      }

      for (const line of linesByInvoice.get(inv.id) ?? []) {
        const hsn = line.hsn_code || "Unassigned";
        const lineTaxable = Number(line.quantity) * Number(line.unit_price);
        const lineTax = Number(line.cgst_amount) + Number(line.sgst_amount) + Number(line.igst_amount);
        const hsnEntry = byHsn.get(hsn) ?? { hsn, taxableValue: 0, tax: 0 };
        hsnEntry.taxableValue += lineTaxable;
        hsnEntry.tax += lineTax;
        byHsn.set(hsn, hsnEntry);
      }
    }

    const creditNotes: SalesCreditNoteRow[] = creditNotesRaw.map((cn) => {
      const sourceRef = cn.source_ref as { sales_invoice_id?: string } | null;
      return {
        id: cn.id,
        credit_note_number: cn.number,
        credit_note_date: cn.doc_date,
        against_invoice_number: (sourceRef?.sales_invoice_id && invoiceNumberById.get(sourceRef.sales_invoice_id)) || "—",
        subtotal: Number(cn.subtotal),
        cgst: Number(cn.cgst_amount),
        sgst: Number(cn.sgst_amount),
        igst: Number(cn.igst_amount),
      };
    });
    const creditTaxableValue = creditNotes.reduce((s, cn) => s + cn.subtotal, 0);
    const creditTax = creditNotes.reduce((s, cn) => s + cn.cgst + cn.sgst + cn.igst, 0);

    return {
      invoiceCount: invoices.length,
      taxableValue,
      cgst,
      sgst,
      igst,
      totalTax: cgst + sgst + igst,
      missingGstinCount,
      invalidGstinCount,
      b2b: b2b.sort((a, b) => b.cgst + b.sgst + b.igst - (a.cgst + a.sgst + a.igst)),
      b2c: [...b2c.values()].sort((a, b) => b.tax - a.tax),
      byHsn: [...byHsn.values()].sort((a, b) => b.tax - a.tax),
      creditNotes,
      creditTaxableValue,
      creditTax,
      netTaxableValue: taxableValue - creditTaxableValue,
      netTax: cgst + sgst + igst - creditTax,
    };
  },
);
