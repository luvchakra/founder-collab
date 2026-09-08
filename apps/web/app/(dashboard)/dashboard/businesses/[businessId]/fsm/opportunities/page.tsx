import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import { listOpportunities, listCustomerOptions } from "@cofounderai/module-fsm/lib/opportunities/queries";
import { listActiveServiceTypeOptions } from "@cofounderai/module-fsm/lib/service-types/queries";
import { OpportunitiesList } from "@cofounderai/module-fsm/components/opportunities/opportunities-list";
import { createOpportunityAction } from "./actions";

export default async function OpportunitiesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [opportunities, customers, serviceTypes] = await Promise.all([
    listOpportunities(businessId),
    listCustomerOptions(businessId),
    listActiveServiceTypeOptions(businessId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Opportunities</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Prospects and leads for {business.name}, from first contact to a scheduled job.
        </p>
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
