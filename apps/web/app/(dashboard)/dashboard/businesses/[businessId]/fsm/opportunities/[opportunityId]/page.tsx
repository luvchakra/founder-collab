import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-fsm/lib/tenancy/queries";
import { getOpportunity, getOpportunityContext } from "@cofounderai/module-fsm/lib/opportunities/queries";
import { listTagsFor } from "@cofounderai/module-fsm/lib/tags/queries";
import { listCustomFieldsWithValues } from "@cofounderai/module-fsm/lib/custom-fields/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { OpportunityDetail } from "@cofounderai/module-fsm/components/opportunities/opportunity-detail";
import {
  addOpportunityTagAction,
  markOpportunityLostAction,
  removeOpportunityTagAction,
  reopenOpportunityAction,
  setOpportunityCustomFieldAction,
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

  const [{ partyName, serviceTypeName }, tags, customFields, canEdit] = await Promise.all([
    getOpportunityContext(opportunity),
    listTagsFor(businessId, "opportunity", opportunityId),
    listCustomFieldsWithValues(businessId, "opportunity", opportunity.service_type_id, opportunityId),
    hasPermission(businessId, "opportunities.edit"),
  ]);

  return (
    <OpportunityDetail
      opportunity={opportunity}
      partyName={partyName}
      serviceTypeName={serviceTypeName}
      tags={tags}
      customFields={customFields}
      canEdit={canEdit}
      updateAction={updateOpportunityAction.bind(null, businessId, opportunityId)}
      markLostAction={markOpportunityLostAction.bind(null, businessId, opportunityId)}
      reopenAction={reopenOpportunityAction.bind(null, businessId, opportunityId)}
      addTagAction={addOpportunityTagAction.bind(null, businessId, opportunityId)}
      removeTagAction={removeOpportunityTagAction.bind(null, businessId, opportunityId)}
      setCustomFieldAction={setOpportunityCustomFieldAction.bind(null, businessId, opportunityId)}
    />
  );
}
