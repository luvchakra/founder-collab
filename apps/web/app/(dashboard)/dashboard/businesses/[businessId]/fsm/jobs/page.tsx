import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import { listJobs } from "@cofounderai/module-fsm/lib/jobs/queries";
import { listCustomerOptions } from "@cofounderai/module-fsm/lib/opportunities/queries";
import { listActiveServiceTypeOptions } from "@cofounderai/module-fsm/lib/service-types/queries";
import { JobsList } from "@cofounderai/module-fsm/components/jobs/jobs-list";
import { createJobAction } from "./actions";

export default async function JobsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [jobs, customers, serviceTypes] = await Promise.all([
    listJobs(businessId),
    listCustomerOptions(businessId),
    listActiveServiceTypeOptions(businessId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Jobs</h1>
        <p className="mt-1 text-sm text-muted-foreground">Scheduled and in-progress work for {business.name}.</p>
      </div>

      <JobsList jobs={jobs} customers={customers} serviceTypes={serviceTypes} createAction={createJobAction.bind(null, businessId)} />
    </div>
  );
}
