import { notFound } from "next/navigation";
import { getProduct, getWorkspaceForProduct } from "@cofounderai/module-discovery/lib/tenancy/queries";
import { getOpportunity } from "@cofounderai/module-discovery/lib/opportunities/queries";
import { getProspect } from "@cofounderai/module-discovery/lib/prospects/queries";
import { listSignalsForProspect } from "@cofounderai/module-discovery/lib/signals/queries";
import { getProspectResearch } from "@cofounderai/module-discovery/lib/research/queries";
import { getResearchBrief } from "@cofounderai/module-discovery/lib/research-briefs/queries";
import { getBuyerIntelligenceForProspect } from "@cofounderai/module-discovery/lib/buyer-intelligence/queries";
import { computeBuyerFitScores } from "@cofounderai/module-discovery/lib/buyer-intelligence/scoring";
import { listRecentProspectScores } from "@cofounderai/module-discovery/lib/scoring/queries";
import { OpportunityDetail } from "@cofounderai/module-discovery/components/opportunities/opportunity-detail";
import { computeHandoffStatus } from "@cofounderai/module-discovery/lib/opportunities/handoff";
import { classifyExistingRelationship, getDiscoveryHandoffLead } from "@cofounderai/module-crm/contract/index";
import { sendOpportunityToCrmAction, updateOpportunityStatusAction, updateRecommendedActionAction } from "./actions";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string; opportunityId: string }>;
}) {
  const { businessId, productId, opportunityId } = await params;
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const opportunity = await getOpportunity(opportunityId);
  if (!opportunity || opportunity.workspace_id !== workspace.id) notFound();

  const prospect = await getProspect(opportunity.prospect_id);
  if (!prospect) notFound();

  const [signals, research, researchBrief, buyerIntelligence, scoreHistory] = await Promise.all([
    listSignalsForProspect(prospect.id),
    getProspectResearch(prospect.id),
    getResearchBrief(prospect.id),
    getBuyerIntelligenceForProspect(workspace.id, prospect.id),
    listRecentProspectScores(prospect.id, 10),
  ]);

  const { primaryContactId } = computeBuyerFitScores(buyerIntelligence);
  const primaryContact = buyerIntelligence.find((person) => person.contact.id === primaryContactId) ?? buyerIntelligence[0] ?? null;

  // DISC-OFFER-P0-08.2: "before handoff classify" -- a degraded null (not a thrown
  // error) when CRM isn't licensed for this business, ADR-10's normal-result pattern.
  const relationshipResult = await classifyExistingRelationship(businessId, {
    companyName: prospect.company_name,
    excludePartyId: prospect.party_id,
    contactEmail: primaryContact?.contact.email ?? null,
  });
  const relationship = relationshipResult.ok ? relationshipResult.data : null;

  // DISC-OFFER-P0-08.3: "Handoff Status" -- a degraded null (CRM not licensed) reads as
  // "no existing lead found," same ADR-10 normal-result handling as relationshipResult
  // above; computeHandoffStatus is deterministic and doesn't need to distinguish "CRM
  // unlicensed" from "no lead exists yet" since neither implies this opportunity's own
  // handoff has failed or succeeded.
  const handoffLeadResult = await getDiscoveryHandoffLead(businessId, prospect.id);
  const handoffStatus = computeHandoffStatus({
    opportunityStatus: opportunity.status,
    handoffFailedAt: opportunity.handoff_failed_at,
    hasExistingCrmLead: handoffLeadResult.ok && handoffLeadResult.data !== null,
  });

  return (
    <OpportunityDetail
      businessId={businessId}
      productId={productId}
      opportunity={opportunity}
      prospect={prospect}
      signals={signals}
      research={research}
      researchBrief={researchBrief}
      primaryContact={primaryContact}
      scoreHistory={scoreHistory}
      hasParty={Boolean(prospect.party_id)}
      relationship={relationship}
      handoffStatus={handoffStatus}
      updateStatusAction={updateOpportunityStatusAction.bind(null, businessId, productId, opportunity.id)}
      sendToCrmAction={sendOpportunityToCrmAction.bind(null, businessId, productId, opportunity.id, prospect.id, prospect.party_id ?? "")}
      updateRecommendedActionAction={updateRecommendedActionAction.bind(null, businessId, productId, opportunity.id)}
    />
  );
}
