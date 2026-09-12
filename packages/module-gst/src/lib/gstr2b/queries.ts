import { createClient } from "../../db/server";
import type { Gstr2bDocument, Gstr2bStatement, Gstr2bStatementWithDocuments } from "./types";

/** COMPLY-P0-08.1: read-side for `gst.gstr2b_statements`/`gst.gstr2b_documents` -- runs
 * as the authenticated user (RLS-scoped, matching every other read in this module; a
 * statement's own content is not a secret the way a GSP credential is). Deliberately NOT
 * wrapped in React's `cache()` (unlike `lib/filing/queries.ts`'s own pure display
 * registers) -- `mutations.ts`'s own `importGstr2bStatement` reads a statement back
 * immediately after writing it within the same request, and a memoized stale read here
 * would silently return pre-import data, same reasoning `lib/returns/lifecycle/queries.ts`
 * already documents for why ITS OWN reads aren't `cache()`'d either. */

const STATEMENT_COLUMNS = "id, business_id, return_period, gstin, generated_on, fetched_at, source, created_by, created_at, updated_at";

function mapStatement(row: {
  id: string;
  business_id: string;
  return_period: string;
  gstin: string | null;
  generated_on: string | null;
  fetched_at: string;
  source: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}): Gstr2bStatement {
  return {
    id: row.id,
    businessId: row.business_id,
    returnPeriod: row.return_period,
    gstin: row.gstin,
    generatedOn: row.generated_on,
    fetchedAt: row.fetched_at,
    source: row.source as Gstr2bStatement["source"],
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const DOCUMENT_COLUMNS =
  "id, statement_id, business_id, section, document_type, supplier_gstin, supplier_trade_name, document_number, document_date, document_value, place_of_supply, reverse_charge, taxable_value, igst_amount, cgst_amount, sgst_amount, cess_amount, itc_available, ineligibility_reason, supplier_filing_period, supplier_filed_date, created_at";

function mapDocument(row: {
  id: string;
  statement_id: string;
  business_id: string;
  section: string;
  document_type: string;
  supplier_gstin: string;
  supplier_trade_name: string | null;
  document_number: string;
  document_date: string | null;
  document_value: number | string | null;
  place_of_supply: string | null;
  reverse_charge: boolean;
  taxable_value: number | string;
  igst_amount: number | string;
  cgst_amount: number | string;
  sgst_amount: number | string;
  cess_amount: number | string;
  itc_available: boolean;
  ineligibility_reason: string | null;
  supplier_filing_period: string | null;
  supplier_filed_date: string | null;
  created_at: string;
}): Gstr2bDocument {
  return {
    id: row.id,
    statementId: row.statement_id,
    businessId: row.business_id,
    section: row.section as Gstr2bDocument["section"],
    documentType: row.document_type as Gstr2bDocument["documentType"],
    supplierGstin: row.supplier_gstin,
    supplierTradeName: row.supplier_trade_name,
    documentNumber: row.document_number,
    documentDate: row.document_date,
    documentValue: row.document_value === null ? null : Number(row.document_value),
    placeOfSupply: row.place_of_supply,
    reverseCharge: row.reverse_charge,
    taxableValue: Number(row.taxable_value),
    igstAmount: Number(row.igst_amount),
    cgstAmount: Number(row.cgst_amount),
    sgstAmount: Number(row.sgst_amount),
    cessAmount: Number(row.cess_amount),
    itcAvailable: row.itc_available,
    ineligibilityReason: row.ineligibility_reason,
    supplierFilingPeriod: row.supplier_filing_period,
    supplierFiledDate: row.supplier_filed_date,
    createdAt: row.created_at,
  };
}

export async function getGstr2bStatement(businessId: string, returnPeriod: string): Promise<Gstr2bStatement | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gstr2b_statements")
    .select(STATEMENT_COLUMNS)
    .eq("business_id", businessId)
    .eq("return_period", returnPeriod)
    .maybeSingle();
  if (error) throw error;
  return data ? mapStatement(data) : null;
}

export async function listGstr2bStatements(businessId: string): Promise<Gstr2bStatement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gstr2b_statements")
    .select(STATEMENT_COLUMNS)
    .eq("business_id", businessId)
    .order("return_period", { ascending: false });
  if (error) throw error;
  return data.map(mapStatement);
}

export async function getGstr2bDocuments(businessId: string, statementId: string): Promise<Gstr2bDocument[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gstr2b_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("business_id", businessId)
    .eq("statement_id", statementId)
    .order("supplier_gstin")
    .order("document_number");
  if (error) throw error;
  return data.map(mapDocument);
}

export async function getGstr2bStatementWithDocuments(businessId: string, returnPeriod: string): Promise<Gstr2bStatementWithDocuments | null> {
  const statement = await getGstr2bStatement(businessId, returnPeriod);
  if (!statement) return null;
  const documents = await getGstr2bDocuments(businessId, statement.id);
  return { ...statement, documents };
}
