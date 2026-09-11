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
import { updateOpportunityStatusAction } from "./actions";

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
      updateStatusAction={updateOpportunityStatusAction.bind(null, businessId, productId, opportunity.id)}
    />
  );
}
