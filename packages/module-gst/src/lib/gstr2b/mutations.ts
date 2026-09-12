import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { createClient } from "../../db/server";
import { getGstr2bFetchCredentials } from "./credentials";
import { createGspGstr2bFetchAdapter } from "../gstr2b-adapter/gsp-adapter";
import { parseGstr2bJson } from "./parse";
import { getGstr2bStatement } from "./queries";
import type { Gstr2bParseWarning, Gstr2bStatement, Gstr2bStatementSource, RawGstr2bJson } from "./types";

/**
 * COMPLY-P0-08.1: the only write path onto `gst.gstr2b_statements`/`gst.gstr2b_documents`.
 * Manual JSON upload (the realistic universal path -- see the migration file's own
 * docstring for why) and a future GSP-fetch adapter both end up calling this same
 * function with whatever raw JSON they obtained; this function does not care which.
 *
 * Every write goes through the authenticated user's own request-scoped client (RLS-backed,
 * `gst.manage_reconciliation` required) -- unlike e-invoice/e-way-bill generation, this is
 * never called from an unauthenticated cron/event-consumer context, so there's no reason
 * to reach for the admin client the way `generateEinvoice` does.
 *
 * Re-import replaces a statement's own document rows wholesale (delete-then-reinsert, not
 * a diff) -- see the migration's own "RE-IMPORT" paragraph for why. This is a sequence of
 * ordinary Supabase calls, not wrapped in a single database transaction/RPC -- the same
 * multi-step-without-an-explicit-transaction pattern every other multi-table write in this
 * module already uses (e.g. `createReturnPeriod`'s own insert-then-read-back); a partial
 * failure here (statement upserted, document insert fails) leaves a statement with zero
 * documents, which the caller can detect and retry by re-importing the same JSON --
 * `unique(business_id, return_period)` makes that retry idempotent.
 */
export type ImportGstr2bStatementResult = {
  statement: Gstr2bStatement;
  documentCount: number;
  warnings: Gstr2bParseWarning[];
};

export async function importGstr2bStatement(
  businessId: string,
  raw: RawGstr2bJson,
  options: { source: Gstr2bStatementSource; returnPeriod?: string },
): Promise<ImportGstr2bStatementResult> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.manage_reconciliation");

  const parsed = parseGstr2bJson(raw);
  const returnPeriod = options.returnPeriod ?? parsed.returnPeriod;
  if (!returnPeriod) {
    throw new Error("Could not determine the return period (fp) for this GSTR-2B statement -- specify one explicitly, or check the uploaded JSON.");
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(returnPeriod)) {
    throw new Error(`"${returnPeriod}" is not a valid return period (expected YYYY-MM).`);
  }

  const supabase = await createClient();

  const existing = await getGstr2bStatement(businessId, returnPeriod);
  let statementId: string;
  if (existing) {
    const { error } = await supabase
      .from("gstr2b_statements")
      .update({ gstin: parsed.gstin, fetched_at: new Date().toISOString(), source: options.source, raw })
      .eq("business_id", businessId)
      .eq("id", existing.id);
    if (error) throw error;
    statementId = existing.id;

    const { error: deleteError } = await supabase.from("gstr2b_documents").delete().eq("business_id", businessId).eq("statement_id", statementId);
    if (deleteError) throw deleteError;
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("gstr2b_statements")
      .insert({
        business_id: businessId,
        return_period: returnPeriod,
        gstin: parsed.gstin,
        source: options.source,
        raw,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;
    statementId = data.id;
  }

  if (parsed.documents.length > 0) {
    const rows = parsed.documents.map((doc) => ({
      statement_id: statementId,
      business_id: businessId,
      section: doc.section,
      document_type: doc.documentType,
      supplier_gstin: doc.supplierGstin,
      supplier_trade_name: doc.supplierTradeName,
      document_number: doc.documentNumber,
      document_date: doc.documentDate,
      document_value: doc.documentValue,
      place_of_supply: doc.placeOfSupply,
      reverse_charge: doc.reverseCharge,
      taxable_value: doc.taxableValue,
      igst_amount: doc.igstAmount,
      cgst_amount: doc.cgstAmount,
      sgst_amount: doc.sgstAmount,
      cess_amount: doc.cessAmount,
      itc_available: doc.itcAvailable,
      ineligibility_reason: doc.ineligibilityReason,
      supplier_filing_period: doc.supplierFilingPeriod,
      supplier_filed_date: doc.supplierFiledDate,
    }));
    const { error: insertError } = await supabase.from("gstr2b_documents").insert(rows);
    if (insertError) throw insertError;
  }

  const statement = await getGstr2bStatement(businessId, returnPeriod);
  if (!statement) throw new Error("GSTR-2B statement was imported but could not be read back.");
  return { statement, documentCount: parsed.documents.length, warnings: parsed.warnings };
}

/**
 * The OPTIONAL adapter-based counterpart to a manual upload -- only usable once a
 * business has configured `gst.gstr2b_credentials` (`upsertGstr2bCredentials`). Fetches
 * via `createGspGstr2bFetchAdapter` and hands the raw JSON straight to
 * `importGstr2bStatement`, so both paths share identical parsing/persistence behavior.
 */
export async function fetchAndImportGstr2bStatement(businessId: string, returnPeriod: string): Promise<ImportGstr2bStatementResult> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.manage_reconciliation");

  const configured = await getGstr2bFetchCredentials(businessId);
  if (!configured) {
    throw new Error("No GSTR-2B fetch credentials configured for this business -- use manual JSON upload instead, or configure a provider in Compliance settings.");
  }

  const adapter = createGspGstr2bFetchAdapter(configured.fetchUrl, configured.credentials);
  const raw = await adapter.fetch(returnPeriod);
  return importGstr2bStatement(businessId, raw, { source: "gsp_fetch", returnPeriod });
}
