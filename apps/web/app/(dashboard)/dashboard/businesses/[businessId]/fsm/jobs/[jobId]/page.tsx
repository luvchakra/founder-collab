import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import { getJob, getJobContext, jobHasInvoice, listJobAuditLog } from "@cofounderai/module-fsm/lib/jobs/queries";
import { listTagsFor } from "@cofounderai/module-fsm/lib/tags/queries";
import { listCustomFieldsWithValues } from "@cofounderai/module-fsm/lib/custom-fields/queries";
import { listTimeEntriesForJob, getOpenTimeEntry } from "@cofounderai/module-fsm/lib/time-entries/queries";
import { listExpensesForJob } from "@cofounderai/module-fsm/lib/expenses/queries";
import { listNotesForJob } from "@cofounderai/module-fsm/lib/notes/queries";
import { listJobAttachments } from "@cofounderai/module-fsm/lib/attachments/queries";
import { listSignaturesForJob } from "@cofounderai/module-fsm/lib/signatures/queries";
import { listJobMessages } from "@cofounderai/module-fsm/lib/messages/queries";
import { listJobMaterialRequirement } from "@cofounderai/module-fsm/lib/inventory-integration/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { hasModule } from "@cofounderai/core/licensing/queries";
import { JobDetail } from "@cofounderai/module-fsm/components/jobs/job-detail";
import {
  addExpenseAction,
  addJobTagAction,
  addNoteAction,
  cancelJobAction,
  captureSignatureAction,
  clockInAction,
  clockOutAction,
  completeJobAction,
  convertJobToOpportunityAction,
  deleteExpenseAction,
  deleteJobAttachmentAction,
  duplicateJobAction,
  getOrCreateInvoiceAction,
  holdJobAction,
  sendCustomerCenterAccessAction,
  markJobScheduledAction,
  removeJobTagAction,
  reopenJobAction,
  resumeJobAction,
  sendJobMessageAction,
  setJobCustomFieldAction,
  startJobAction,
  updateJobAction,
  uploadJobAttachmentAction,
} from "./actions";

export default async function JobDetailPage({ params }: { params: Promise<{ businessId: string; jobId: string }> }) {
  const { businessId, jobId } = await params;
  const [business, job] = await Promise.all([getBusiness(businessId), getJob(businessId, jobId)]);
  if (!business || !job) notFound();

  const [
    { partyName, serviceTypeName },
    tags,
    customFields,
    auditLog,
    canEdit,
    canReopen,
    hasInvoice,
    timeEntries,
    openTimeEntry,
    expenses,
    notes,
    attachments,
    signatures,
    canEditTime,
    canEditExpenses,
    canEditNotes,
    messages,
    canManageMessages,
    inventoryLicensed,
  ] = await Promise.all([
    getJobContext(job),
    listTagsFor(businessId, "job", jobId),
    listCustomFieldsWithValues(businessId, "job", job.service_type_id, jobId),
    listJobAuditLog(businessId, jobId),
    hasPermission(businessId, "jobs.edit"),
    hasPermission(businessId, "jobs.reopen"),
    jobHasInvoice(businessId, jobId),
    listTimeEntriesForJob(businessId, jobId),
    getOpenTimeEntry(businessId),
    listExpensesForJob(businessId, jobId),
    listNotesForJob(businessId, jobId),
    listJobAttachments(jobId),
    listSignaturesForJob(businessId, jobId),
    hasPermission(businessId, "time_entries.edit"),
    hasPermission(businessId, "expenses.edit"),
    hasPermission(businessId, "notes.edit"),
    listJobMessages(businessId, jobId),
    hasPermission(businessId, "messages.manage"),
    hasModule(businessId, "inventory"),
  ]);

  // ADR-10 degraded mode: no Inventory license means no material requirement to
  // compute (Rule 5 -- "don't advertise" the unlicensed capability by omitting the tab
  // entirely rather than fetching and then hiding a populated list).
  const materialRequirement = inventoryLicensed ? await listJobMaterialRequirement(businessId, jobId) : [];

  return (
    <JobDetail
      job={job}
      partyName={partyName}
      serviceTypeName={serviceTypeName}
      tags={tags}
      customFields={customFields}
      auditLog={auditLog}
      canEdit={canEdit}
      canReopen={canReopen}
      canConvertToOpportunity={!hasInvoice}
      timeEntries={timeEntries}
      openTimeEntry={openTimeEntry}
      expenses={expenses}
      notes={notes}
      attachments={attachments}
      signatures={signatures}
      canEditTime={canEditTime}
      canEditExpenses={canEditExpenses}
      canEditNotes={canEditNotes}
      updateAction={updateJobAction.bind(null, businessId, jobId)}
      addTagAction={addJobTagAction.bind(null, businessId, jobId)}
      removeTagAction={removeJobTagAction.bind(null, businessId, jobId)}
      setCustomFieldAction={setJobCustomFieldAction.bind(null, businessId, jobId)}
      markScheduledAction={markJobScheduledAction.bind(null, businessId, jobId)}
      startAction={startJobAction.bind(null, businessId, jobId)}
      holdAction={holdJobAction.bind(null, businessId, jobId)}
      resumeAction={resumeJobAction.bind(null, businessId, jobId)}
      completeAction={completeJobAction.bind(null, businessId, jobId)}
      cancelAction={cancelJobAction.bind(null, businessId, jobId)}
      reopenAction={reopenJobAction.bind(null, businessId, jobId)}
      duplicateAction={duplicateJobAction.bind(null, businessId, jobId)}
      convertToOpportunityAction={convertJobToOpportunityAction.bind(null, businessId, jobId)}
      invoiceAction={getOrCreateInvoiceAction.bind(null, businessId, jobId)}
      sendCustomerCenterAccessAction={sendCustomerCenterAccessAction.bind(null, businessId, job.party_id)}
      clockInAction={clockInAction.bind(null, businessId, jobId)}
      clockOutAction={clockOutAction.bind(null, businessId, jobId)}
      addExpenseAction={addExpenseAction.bind(null, businessId, jobId)}
      deleteExpenseAction={deleteExpenseAction.bind(null, businessId, jobId)}
      addNoteAction={addNoteAction.bind(null, businessId, jobId)}
      uploadAttachmentAction={uploadJobAttachmentAction.bind(null, businessId, jobId)}
      deleteAttachmentAction={deleteJobAttachmentAction.bind(null, businessId, jobId)}
      captureSignatureAction={captureSignatureAction.bind(null, businessId, jobId)}
      messages={messages}
      canManageMessages={canManageMessages}
      sendMessageAction={sendJobMessageAction.bind(null, businessId, jobId)}
      inventoryLicensed={inventoryLicensed}
      materialRequirement={materialRequirement}
    />
  );
}
