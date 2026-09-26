import { createHash } from "node:crypto";
import { writeAuditLog } from "../audit/mutations";
import { createAdminClient } from "../db/admin";
import { createClient } from "../db/server";
import { renderExport } from "./render";
import type { ExportContext } from "./server";
import type { ExportWorkbookDefinition } from "./types";

/**
 * EXP-PLAT-06 -- large exports as jobs (§17). See the migration
 * (20260926100000_core_export_jobs.sql) for the table and bucket.
 *
 * Every read and write here runs under the requesting user's own session except
 * `expireExportJobs()`, which the daily cron runs with the service role to delete files
 * past their expiry -- a cleanup no single user can be trusted to do for everyone.
 */

export const EXPORT_BUCKET = "exports";
/** A signed download link lives for five minutes: long enough to start the download,
 * short enough that a leaked link is useless soon after. */
const SIGNED_URL_SECONDS = 300;

export type ExportJob = {
  id: string;
  businessId: string;
  adapterId: string;
  title: string;
  format: "csv" | "xlsx";
  status: "queued" | "running" | "ready" | "failed" | "expired";
  rowCount: number | null;
  filename: string | null;
  createdAt: string;
  expiresAt: string;
};

type JobRow = {
  id: string;
  business_id: string;
  adapter_id: string;
  title: string;
  format: "csv" | "xlsx";
  status: ExportJob["status"];
  row_count: number | null;
  filename: string | null;
  created_at: string;
  expires_at: string;
};

const toJob = (row: JobRow): ExportJob => ({
  id: row.id,
  businessId: row.business_id,
  adapterId: row.adapter_id,
  title: row.title,
  format: row.format,
  status: row.status,
  rowCount: row.row_count,
  filename: row.filename,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
});

/** Same adapter, format, scope and filters from the same user = the same export. */
export function exportDedupeKey(adapterId: string, format: string, scope: string, filters: Record<string, string>): string {
  const canonical = JSON.stringify([adapterId, format, scope, Object.entries(filters).sort(([a], [b]) => a.localeCompare(b))]);
  return createHash("sha256").update(canonical).digest("hex");
}

/** Records a queued job. Returns `null` when the identical export is already being
 * prepared -- the double-click case -- rather than starting a second one. */
export async function queueExportJob(
  context: ExportContext,
  adapterId: string,
  title: string,
  filters: Record<string, string>,
): Promise<{ id: string } | null> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase
    .from("export_jobs")
    .insert({
      business_id: context.businessId,
      requested_by: context.userId,
      adapter_id: adapterId,
      title,
      format: context.format,
      scope: context.scope,
      filters,
      dedupe_key: exportDedupeKey(adapterId, context.format, context.scope, filters),
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return null; // already in flight
    throw error;
  }
  return { id: data.id as string };
}

/** Builds the file for a queued job and stores it. Runs after the response has been
 * sent, under the same user's session; any failure marks the job failed (and is
 * audited) rather than leaving it "running" forever. */
export async function completeExportJob(
  jobId: string,
  context: ExportContext,
  workbook: ExportWorkbookDefinition,
  info: Record<string, string>,
  filters: Record<string, string>,
): Promise<void> {
  const supabase = await createClient({ schema: "core" });
  const storage = (await createClient()).storage.from(EXPORT_BUCKET);
  const [module, resource] = jobIdParts(workbook);
  await supabase.from("export_jobs").update({ status: "running" }).eq("id", jobId);
  try {
    const file = await renderExport(workbook, context.format, { timeZone: context.timeZone, generatedAt: new Date(), info });
    const path = `${context.businessId}/${context.userId}/${jobId}/${file.filename}`;
    const { error: uploadError } = await storage.upload(path, file.body, { contentType: file.contentType, upsert: false });
    if (uploadError) throw uploadError;
    const { error } = await supabase
      .from("export_jobs")
      .update({ status: "ready", row_count: file.rowCount, filename: file.filename, file_path: path, finished_at: new Date().toISOString() })
      .eq("id", jobId);
    if (error) throw error;
    await writeAuditLog({
      businessId: context.businessId,
      actorId: context.userId,
      action: "export.generated",
      entityType: "export",
      entityId: jobId,
      after: { module, resource, format: context.format, scope: context.scope, row_count: file.rowCount, filters, background: true },
    });
  } catch (error) {
    console.error(`[exports] background job ${jobId} failed`, error);
    await supabase
      .from("export_jobs")
      .update({ status: "failed", error: "We could not generate this export.", finished_at: new Date().toISOString() })
      .eq("id", jobId);
    await writeAuditLog({
      businessId: context.businessId,
      actorId: context.userId,
      action: "export.failed",
      entityType: "export",
      entityId: jobId,
      after: { module, resource, format: context.format, scope: context.scope, filters, background: true },
    }).catch(() => undefined);
  }
}

function jobIdParts(workbook: ExportWorkbookDefinition): [string, string] {
  return [workbook.module, workbook.resource];
}

/** The signed-in user's recent export jobs -- for the bell's "export ready" alerts. */
export async function listMyRecentExportJobs(limit = 10): Promise<ExportJob[]> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase
    .from("export_jobs")
    .select("id, business_id, adapter_id, title, format, status, row_count, filename, created_at, expires_at")
    .in("status", ["ready", "failed"])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as JobRow[]).map(toJob);
}

/** A short-lived link to a finished job's file, or why there isn't one. RLS decides
 * whether the job is visible at all: someone else's job id simply isn't found. */
export async function getExportJobDownloadUrl(
  jobId: string,
): Promise<{ url: string } | { error: "not_found" | "not_ready" | "expired" }> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase
    .from("export_jobs")
    .select("status, file_path, filename, expires_at")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { error: "not_found" };
  if (data.status === "expired" || new Date(data.expires_at as string) <= new Date()) return { error: "expired" };
  if (data.status !== "ready" || !data.file_path) return { error: "not_ready" };
  const storage = (await createClient()).storage.from(EXPORT_BUCKET);
  const { data: signed, error: signError } = await storage.createSignedUrl(data.file_path as string, SIGNED_URL_SECONDS, {
    download: (data.filename as string | null) ?? true,
  });
  if (signError || !signed) throw signError ?? new Error("Could not sign the export file.");
  return { url: signed.signedUrl };
}

/** Daily cleanup (service role): deletes files past their expiry and marks their jobs
 * expired. Returns how many jobs it expired. */
export async function expireExportJobs(now = new Date()): Promise<number> {
  const admin = createAdminClient({ schema: "core" });
  const { data, error } = await admin
    .from("export_jobs")
    .select("id, file_path")
    .lte("expires_at", now.toISOString())
    .neq("status", "expired")
    .limit(500);
  if (error) throw error;
  const rows = (data ?? []) as { id: string; file_path: string | null }[];
  if (rows.length === 0) return 0;
  const paths = rows.map((row) => row.file_path).filter((path): path is string => Boolean(path));
  if (paths.length > 0) {
    const { error: removeError } = await createAdminClient().storage.from(EXPORT_BUCKET).remove(paths);
    if (removeError) throw removeError;
  }
  const { error: updateError } = await admin
    .from("export_jobs")
    .update({ status: "expired", file_path: null })
    .in("id", rows.map((row) => row.id));
  if (updateError) throw updateError;
  return rows.length;
}
