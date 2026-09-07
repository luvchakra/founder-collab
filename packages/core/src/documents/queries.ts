import { createClient } from "../db/server";
import type { DocType, Document, DocumentLine } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

export async function listDocumentsForBusiness(businessId: string, docType?: DocType): Promise<Document[]> {
  const supabase = await coreClient();
  let query = supabase.from("documents").select("*").eq("business_id", businessId);
  if (docType) query = query.eq("doc_type", docType);
  const { data, error } = await query.order("doc_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getDocument(documentId: string): Promise<Document | null> {
  const supabase = await coreClient();
  const { data, error } = await supabase.from("documents").select("*").eq("id", documentId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listDocumentLines(documentId: string): Promise<DocumentLine[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("document_lines")
    .select("*")
    .eq("document_id", documentId)
    .order("sort_order");
  if (error) throw error;
  return data;
}
