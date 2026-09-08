"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import {
  cancelJob,
  completeJob,
  convertJobToOpportunity,
  duplicateJob,
  holdJob,
  markJobScheduled,
  reopenJob,
  resumeJob,
  startJob,
  updateJob,
} from "@cofounderai/module-fsm/lib/jobs/mutations";
import { getJob, jobHasInvoice } from "@cofounderai/module-fsm/lib/jobs/queries";
import { getOrCreateInvoiceForJob } from "@cofounderai/module-fsm/lib/invoices/mutations";
import { addWorkTag, removeWorkTag } from "@cofounderai/module-fsm/lib/tags/mutations";
import { setCustomFieldValue } from "@cofounderai/module-fsm/lib/custom-fields/mutations";
import { clockIn, clockOut } from "@cofounderai/module-fsm/lib/time-entries/mutations";
import { addExpense, deleteExpense } from "@cofounderai/module-fsm/lib/expenses/mutations";
import { addNote } from "@cofounderai/module-fsm/lib/notes/mutations";
import { uploadJobAttachment, deleteJobAttachment } from "@cofounderai/module-fsm/lib/attachments/mutations";
import { captureSignature } from "@cofounderai/module-fsm/lib/signatures/mutations";
import type { NoteVisibility } from "@cofounderai/module-fsm/lib/notes/types";

const TAGGABLE_TYPE = "job";

function detailPath(businessId: string, jobId: string) {
  return `/dashboard/businesses/${businessId}/fsm/jobs/${jobId}`;
}

export async function updateJobAction(businessId: string, jobId: string, description: string, scopeOfWork: string): Promise<void> {
  await requirePermission(businessId, "jobs.edit");
  await updateJob(jobId, businessId, { description, scopeOfWork });
  revalidatePath(detailPath(businessId, jobId));
}

export async function addJobTagAction(businessId: string, jobId: string, name: string): Promise<void> {
  await requirePermission(businessId, "jobs.edit");
  await addWorkTag(businessId, TAGGABLE_TYPE, jobId, name);
  revalidatePath(detailPath(businessId, jobId));
}

export async function removeJobTagAction(businessId: string, jobId: string, tagId: string): Promise<void> {
  await requirePermission(businessId, "jobs.edit");
  await removeWorkTag(businessId, tagId, jobId);
  revalidatePath(detailPath(businessId, jobId));
}

export async function setJobCustomFieldAction(businessId: string, jobId: string, fieldDefId: string, value: unknown): Promise<void> {
  await requirePermission(businessId, "jobs.edit");
  await setCustomFieldValue(businessId, fieldDefId, jobId, value);
  revalidatePath(detailPath(businessId, jobId));
}

export async function markJobScheduledAction(businessId: string, jobId: string): Promise<void> {
  await requirePermission(businessId, "jobs.edit");
  await markJobScheduled(jobId, businessId);
  revalidatePath(detailPath(businessId, jobId));
}

export async function startJobAction(businessId: string, jobId: string): Promise<void> {
  await requirePermission(businessId, "jobs.edit");
  await startJob(jobId, businessId);
  revalidatePath(detailPath(businessId, jobId));
}

export async function holdJobAction(businessId: string, jobId: string, reason: string): Promise<void> {
  await requirePermission(businessId, "jobs.edit");
  await holdJob(jobId, businessId, reason);
  revalidatePath(detailPath(businessId, jobId));
}

export async function resumeJobAction(businessId: string, jobId: string): Promise<void> {
  await requirePermission(businessId, "jobs.edit");
  await resumeJob(jobId, businessId);
  revalidatePath(detailPath(businessId, jobId));
}

export async function completeJobAction(businessId: string, jobId: string): Promise<void> {
  await requirePermission(businessId, "jobs.edit");
  await completeJob(jobId, businessId);
  revalidatePath(detailPath(businessId, jobId));
}

export async function cancelJobAction(businessId: string, jobId: string): Promise<void> {
  await requirePermission(businessId, "jobs.edit");
  await cancelJob(jobId, businessId);
  revalidatePath(detailPath(businessId, jobId));
}

/** Admin-only (PRD §4) -- gated on `jobs.reopen`, a permission distinct from the
 * ordinary `jobs.edit` every other action here uses. */
export async function reopenJobAction(businessId: string, jobId: string): Promise<void> {
  await requirePermission(businessId, "jobs.reopen");
  await reopenJob(jobId, businessId);
  revalidatePath(detailPath(businessId, jobId));
}

export async function duplicateJobAction(businessId: string, jobId: string): Promise<{ id: string }> {
  await requirePermission(businessId, "jobs.edit");
  const id = await duplicateJob(jobId, businessId);
  return { id };
}

export async function convertJobToOpportunityAction(businessId: string, jobId: string): Promise<{ id: string }> {
  await requirePermission(businessId, "jobs.edit");
  const hasInvoice = await jobHasInvoice(businessId, jobId);
  if (hasInvoice) throw new Error("This job already has an invoice and can no longer be converted back to an opportunity.");
  const job = await getJob(businessId, jobId);
  if (!job) throw new Error("Job not found.");
  const id = await convertJobToOpportunity(job, businessId);
  return { id };
}

/** "Generate invoice" from the job header -- idempotent (returns the existing invoice
 * if one already exists), gated on `invoices.create` rather than `jobs.edit` since
 * generating an invoice is a billing action, not a job-editing one. */
export async function getOrCreateInvoiceAction(businessId: string, jobId: string): Promise<{ id: string }> {
  await requirePermission(businessId, "invoices.create");
  const id = await getOrCreateInvoiceForJob(businessId, jobId);
  return { id };
}

export async function clockInAction(businessId: string, jobId: string): Promise<void> {
  await requirePermission(businessId, "time_entries.edit");
  await clockIn(businessId, jobId);
  revalidatePath(detailPath(businessId, jobId));
}

export async function clockOutAction(businessId: string, jobId: string): Promise<void> {
  await requirePermission(businessId, "time_entries.edit");
  await clockOut(businessId, jobId);
  revalidatePath(detailPath(businessId, jobId));
}

export async function addExpenseAction(businessId: string, jobId: string, description: string, amount: number): Promise<void> {
  await requirePermission(businessId, "expenses.edit");
  await addExpense(businessId, jobId, { description, amount });
  revalidatePath(detailPath(businessId, jobId));
}

export async function deleteExpenseAction(businessId: string, jobId: string, expenseId: string): Promise<void> {
  await requirePermission(businessId, "expenses.edit");
  await deleteExpense(expenseId, businessId);
  revalidatePath(detailPath(businessId, jobId));
}

export async function addNoteAction(businessId: string, jobId: string, body: string, visibility: NoteVisibility): Promise<void> {
  await requirePermission(businessId, "notes.edit");
  await addNote(businessId, jobId, body, visibility);
  revalidatePath(detailPath(businessId, jobId));
}

export async function uploadJobAttachmentAction(businessId: string, jobId: string, formData: FormData): Promise<void> {
  await requirePermission(businessId, "jobs.edit");
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided.");
  await uploadJobAttachment(businessId, jobId, file);
  revalidatePath(detailPath(businessId, jobId));
}

export async function deleteJobAttachmentAction(businessId: string, jobId: string, attachmentId: string): Promise<void> {
  await requirePermission(businessId, "jobs.edit");
  await deleteJobAttachment(attachmentId);
  revalidatePath(detailPath(businessId, jobId));
}

export async function captureSignatureAction(businessId: string, jobId: string, formData: FormData): Promise<void> {
  await requirePermission(businessId, "jobs.edit");
  const signerName = String(formData.get("signer_name") ?? "");
  const image = formData.get("image");
  if (!(image instanceof Blob)) throw new Error("No signature image provided.");
  await captureSignature(businessId, jobId, signerName, image);
  revalidatePath(detailPath(businessId, jobId));
}
