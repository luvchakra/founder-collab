import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import { listJobs } from "@cofounderai/module-fsm/lib/jobs/queries";
import { listCustomerOptions } from "@cofounderai/module-fsm/lib/opportunities/queries";
import { listActiveServiceTypeOptions } from "@cofounderai/module-fsm/lib/service-types/queries";
import { JobsList } from "@cofounderai/module-fsm/components/jobs/jobs-list";
import { createJobAction } from "./actions";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

export default async function JobsPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [jobs, customers, serviceTypes] = await Promise.all([
    listJobs(businessId),
    listCustomerOptions(businessId),
    listActiveServiceTypeOptions(businessId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Jobs</h1>
          <p className="mt-1 text-sm text-muted-foreground">Scheduled and in-progress work for {business.name}.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportMenu exportId="fsm.jobs" businessSlug={businessSlug} />
        </div>
      </div>

      <JobsList jobs={jobs} customers={customers} serviceTypes={serviceTypes} createAction={createJobAction.bind(null, businessId)} />
    </div>
  );
}
