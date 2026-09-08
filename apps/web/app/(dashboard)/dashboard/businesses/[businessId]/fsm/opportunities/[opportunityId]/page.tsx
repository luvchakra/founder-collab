import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import { getOpportunity, getOpportunityContext } from "@cofounderai/module-fsm/lib/opportunities/queries";
import { listTagsFor } from "@cofounderai/module-fsm/lib/tags/queries";
import { listCustomFieldsWithValues } from "@cofounderai/module-fsm/lib/custom-fields/queries";
import { getEstimateForOpportunity, listChargeableItemOptions, listEstimateLines } from "@cofounderai/module-fsm/lib/estimates/queries";
import { listActiveJobChargeTypeOptions } from "@cofounderai/module-fsm/lib/job-charge-types/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { OpportunityDetail } from "@cofounderai/module-fsm/components/opportunities/opportunity-detail";
import { EstimateBuilder } from "@cofounderai/module-fsm/components/estimates/estimate-builder";
import {
  addEstimateChargeLineAction,
  addOpportunityTagAction,
  approveEstimateInternalAction,
  declineEstimateInternalAction,
  deleteEstimateChargeLineAction,
  markOpportunityLostAction,
  removeOpportunityTagAction,
  reopenOpportunityAction,
  reorderEstimateChargeLinesAction,
  sendEstimateAction,
  setOpportunityCustomFieldAction,
  updateEstimateChargeLineAction,
  updateOpportunityAction,
} from "./actions";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; opportunityId: string }>;
}) {
  const { businessId, opportunityId } = await params;
  const [business, opportunity] = await Promise.all([getBusiness(businessId), getOpportunity(businessId, opportunityId)]);
  if (!business || !opportunity) notFound();

  const [{ partyName, serviceTypeName }, tags, customFields, canEditOpportunity, canEditEstimates, estimate, items, jobChargeTypes] =
    await Promise.all([
      getOpportunityContext(opportunity),
      listTagsFor(businessId, "opportunity", opportunityId),
      listCustomFieldsWithValues(businessId, "opportunity", opportunity.service_type_id, opportunityId),
      hasPermission(businessId, "opportunities.edit"),
      hasPermission(businessId, "estimates.edit"),
      getEstimateForOpportunity(businessId, opportunityId),
      listChargeableItemOptions(businessId),
      listActiveJobChargeTypeOptions(businessId),
    ]);

  const lines = estimate ? await listEstimateLines(businessId, estimate.id) : [];

  return (
    <div className="flex flex-col gap-8">
      <OpportunityDetail
        opportunity={opportunity}
        partyName={partyName}
        serviceTypeName={serviceTypeName}
        tags={tags}
        customFields={customFields}
        canEdit={canEditOpportunity}
        updateAction={updateOpportunityAction.bind(null, businessId, opportunityId)}
        markLostAction={markOpportunityLostAction.bind(null, businessId, opportunityId)}
        reopenAction={reopenOpportunityAction.bind(null, businessId, opportunityId)}
        addTagAction={addOpportunityTagAction.bind(null, businessId, opportunityId)}
        removeTagAction={removeOpportunityTagAction.bind(null, businessId, opportunityId)}
        setCustomFieldAction={setOpportunityCustomFieldAction.bind(null, businessId, opportunityId)}
      />

      <div>
        <h2 className="mb-3 text-lg font-semibold">Estimate</h2>
        <EstimateBuilder
          estimate={estimate}
          lines={lines}
          items={items}
          jobChargeTypes={jobChargeTypes}
          canEdit={canEditEstimates}
          addLineAction={addEstimateChargeLineAction.bind(null, businessId, opportunityId)}
          updateLineAction={updateEstimateChargeLineAction.bind(null, businessId, estimate?.id ?? "", opportunityId)}
          deleteLineAction={deleteEstimateChargeLineAction.bind(null, businessId, estimate?.id ?? "", opportunityId)}
          reorderAction={reorderEstimateChargeLinesAction.bind(null, businessId, estimate?.id ?? "", opportunityId)}
          sendAction={sendEstimateAction.bind(null, businessId, opportunityId, estimate?.id ?? "")}
          approveInternalAction={approveEstimateInternalAction.bind(null, businessId, opportunityId, estimate?.id ?? "")}
          declineInternalAction={declineEstimateInternalAction.bind(null, businessId, opportunityId, estimate?.id ?? "")}
        />
      </div>
    </div>
  );
}
