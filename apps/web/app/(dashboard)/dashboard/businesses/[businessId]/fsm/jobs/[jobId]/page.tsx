import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import { getJob, getJobContext, jobHasInvoice, listJobAuditLog } from "@cofounderai/module-fsm/lib/jobs/queries";
import { listTagsFor } from "@cofounderai/module-fsm/lib/tags/queries";
import { listCustomFieldsWithValues } from "@cofounderai/module-fsm/lib/custom-fields/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { JobDetail } from "@cofounderai/module-fsm/components/jobs/job-detail";
import {
  addJobTagAction,
  cancelJobAction,
  completeJobAction,
  convertJobToOpportunityAction,
  duplicateJobAction,
  holdJobAction,
  markJobScheduledAction,
  removeJobTagAction,
  reopenJobAction,
  resumeJobAction,
  setJobCustomFieldAction,
  startJobAction,
  updateJobAction,
} from "./actions";

export default async function JobDetailPage({ params }: { params: Promise<{ businessId: string; jobId: string }> }) {
  const { businessId, jobId } = await params;
  const [business, job] = await Promise.all([getBusiness(businessId), getJob(businessId, jobId)]);
  if (!business || !job) notFound();

  const [{ partyName, serviceTypeName }, tags, customFields, auditLog, canEdit, canReopen, hasInvoice] = await Promise.all([
    getJobContext(job),
    listTagsFor(businessId, "job", jobId),
    listCustomFieldsWithValues(businessId, "job", job.service_type_id, jobId),
    listJobAuditLog(businessId, jobId),
    hasPermission(businessId, "jobs.edit"),
    hasPermission(businessId, "jobs.reopen"),
    jobHasInvoice(businessId, jobId),
  ]);

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
    />
  );
}
