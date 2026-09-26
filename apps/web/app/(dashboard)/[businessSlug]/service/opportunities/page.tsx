import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import { listOpportunities, listCustomerOptions } from "@cofounderai/module-fsm/lib/opportunities/queries";
import { listActiveServiceTypeOptions } from "@cofounderai/module-fsm/lib/service-types/queries";
import { OpportunitiesList } from "@cofounderai/module-fsm/components/opportunities/opportunities-list";
import { createOpportunityAction } from "./actions";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

export default async function OpportunitiesPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [opportunities, customers, serviceTypes] = await Promise.all([
    listOpportunities(businessId),
    listCustomerOptions(businessId),
    listActiveServiceTypeOptions(businessId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Opportunities</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Prospects and leads for {business.name}, from first contact to a scheduled job.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportMenu exportId="fsm.opportunities" businessSlug={businessSlug} />
        </div>
      </div>

      <OpportunitiesList
        opportunities={opportunities}
        customers={customers}
        serviceTypes={serviceTypes}
        createAction={createOpportunityAction.bind(null, businessId)}
      />
    </div>
  );
}
