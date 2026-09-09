import pdfParse from "pdf-parse";
import * as mammoth from "mammoth";
import { createClient } from "../../db/server";
import type { KnowledgeSourceType, ProductKnowledge } from "./types";

const MAX_CONTENT_LENGTH = 15_000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export async function addKnowledgeSource(
  workspaceId: string,
  input: { sourceType: KnowledgeSourceType; sourceName: string; content: string },
): Promise<ProductKnowledge> {
  const content = input.content.trim();
  if (!content) throw new Error("Content is required.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_knowledge")
    .insert({
      workspace_id: workspaceId,
      source_type: input.sourceType,
      source_name: input.sourceName.trim() || input.sourceType,
      content: content.slice(0, MAX_CONTENT_LENGTH),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteKnowledgeSource(sourceId: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("product_knowledge").delete().eq("id", sourceId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      "This knowledge source could not be deleted -- it may have been removed already, or your access to it may have changed.",
    );
  }
}

export async function updateKnowledgeSource(
  sourceId: string,
  content: string,
): Promise<ProductKnowledge> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Content is required.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_knowledge")
    .update({ content: trimmed.slice(0, MAX_CONTENT_LENGTH) })
    .eq("id", sourceId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * PDF and DOCX get real text extraction (pdf-parse / mammoth) since that's what makes an
 * uploaded file actually useful as AI context, matching the same standard this file
 * already holds websites to (extractTextFromHtml below). Anything else -- images
 * especially -- has no extraction path here (that would mean OCR, a materially bigger
 * feature); it's still uploaded and listed as a knowledge source, just without text
 * content for the AI to read.
 */
async function extractFileText(file: File): Promise<string | null> {
  const name = file.name.toLowerCase();
  const type = file.type;

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { text } = await pdfParse(buffer);
    return text.trim() || null;
  }
  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { value } = await mammoth.extractRawText({ buffer });
    return value.trim() || null;
  }
  if (type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) {
    return (await file.text()).trim() || null;
  }
  return null;
}

/**
 * Uploads the original file to Storage (path <workspace_id>/<timestamp>-<name>, RLS in
 * 20260906060000_knowledge_files_storage_bucket.sql) and records it as a knowledge
 * source, with whatever text extractFileText could pull from it -- or a placeholder note
 * when it couldn't -- as `content`.
 */
export async function addFileKnowledgeSource(
  workspaceId: string,
  file: File,
): Promise<ProductKnowledge> {
  if (file.size === 0) throw new Error("File is empty.");
  if (file.size > MAX_FILE_BYTES) throw new Error("File must be 20MB or smaller.");

  const supabase = await createClient();

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${workspaceId}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("knowledge-files")
    .upload(path, file, { contentType: file.type || "application/octet-stream" });
  if (uploadError) throw uploadError;

  let extracted: string | null = null;
  try {
    extracted = await extractFileText(file);
  } catch {
    // A corrupt or unusually-encoded file shouldn't block attaching it as a reference --
    // fall through to the placeholder content below.
    extracted = null;
  }

  const content = extracted
    ? extracted.slice(0, MAX_CONTENT_LENGTH)
    : `[${file.type || "file"} attachment -- no text could be extracted for AI context]`;

  const { data, error } = await supabase
    .from("product_knowledge")
    .insert({
      workspace_id: workspaceId,
      source_type: "document",
      source_name: file.name,
      content,
      metadata: { storage_path: path, mime_type: file.type, size: file.size },
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
