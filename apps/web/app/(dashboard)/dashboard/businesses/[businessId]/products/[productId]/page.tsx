import { notFound } from "next/navigation";
import {
  getProduct,
  getWorkspaceForProduct,
} from "@cofounderai/module-discovery/lib/tenancy/queries";
import { listProductKnowledge } from "@cofounderai/module-discovery/lib/knowledge/queries";
import { getIcpProfile } from "@cofounderai/module-discovery/lib/icp/queries";
import { listBuyerPersonas } from "@cofounderai/module-discovery/lib/personas/queries";
import { getProspectCounts } from "@cofounderai/module-discovery/lib/prospects/queries";
import { ProductOverviewShell } from "@cofounderai/module-discovery/components/tenancy/product-overview-shell";
import { OfferingOverviewSummary } from "@cofounderai/module-discovery/components/offerings/offering-overview-summary";
import { RunAiDiscoveryPanel } from "@cofounderai/module-discovery/components/pipeline/run-ai-discovery-panel";
import { TopOpportunityGate } from "@cofounderai/module-discovery/components/opportunities/top-opportunity-gate";
import { listPipelineStages } from "@cofounderai/module-discovery/lib/pipeline/queries";
import { getTopGateOpportunity } from "@cofounderai/module-discovery/lib/opportunities/dashboard-queries";
import { getBuyerIntelligenceForProspect } from "@cofounderai/module-discovery/lib/buyer-intelligence/queries";
import { computeBuyerFitScores } from "@cofounderai/module-discovery/lib/buyer-intelligence/scoring";
import { classifyExistingRelationship } from "@cofounderai/module-crm/contract/index";
import {
  addFileSourceAction,
  addTextSourceAction,
  deleteSourceAction,
  generateProductProfileAction,
  updateProductDescriptionAction,
  updateProductWebsiteAction,
  updateSourceAction,
  sendTopOpportunityToCrmAction,
  updateTopOpportunityStatusAction,
} from "./actions";

function icpPath(businessId: string, productId: string) {
  return `/dashboard/businesses/${businessId}/products/${productId}/icp`;
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ businessId: string; productId: string }>;
}) {
  const { businessId, productId } = await params;
  const product = await getProduct(productId);
  if (!product || product.business_id !== businessId) notFound();

  const workspace = await getWorkspaceForProduct(product.id);
  if (!workspace) notFound();

  const sources = await listProductKnowledge(workspace.id);

  // DISC-OFFER-P0-03.2's "Offering Discovery Overview" -- only shown once the offering
  // has a profile: before that, the setup wizard below (generate a profile from a
  // website/description) already answers "what should I do today," so a dashboard
  // summarizing mostly-empty ICP/persona/prospect state would be redundant noise, not
  // help. Once a profile exists, this becomes the "primary offering workspace" surface
  // the setup shell (still useful for revisiting sources/regenerating the profile) sits
  // below.
  const [icp, personas, prospectCounts] = product.product_profile
    ? await Promise.all([getIcpProfile(workspace.id), listBuyerPersonas(workspace.id), getProspectCounts(workspace.id)])
    : [null, [], null];
  const pipelineStages = await listPipelineStages(workspace.id);

  // DISC-OFFER-P0-15.1: "Final Human Action Gate" -- only fetched once there's real
  // opportunity data to gate on at all (same profile-gated condition as the summary
  // below); a fresh offering with no opportunities yet has nothing here to decide on.
  const topGateRow = prospectCounts ? await getTopGateOpportunity(workspace.id) : null;
  const topGateContext = topGateRow
    ? await (async () => {
        const buyerIntelligence = await getBuyerIntelligenceForProspect(workspace.id, topGateRow.prospect.id);
        const { primaryContactId } = computeBuyerFitScores(buyerIntelligence);
        const primaryContact = buyerIntelligence.find((person) => person.contact.id === primaryContactId) ?? buyerIntelligence[0] ?? null;
        // DISC-OFFER-P0-08.2: a degraded null (CRM not licensed) reads as "no warning to
        // show" -- the same ADR-10 normal-result handling the Opportunity Detail route
        // already applies to this exact call.
        const relationshipResult = await classifyExistingRelationship(businessId, {
          companyName: topGateRow.prospect.company_name,
          excludePartyId: topGateRow.prospect.party_id,
          contactEmail: primaryContact?.contact.email ?? null,
        });
        return {
          contactName: primaryContact?.name ?? null,
          hasParty: Boolean(topGateRow.prospect.party_id),
          relationship: relationshipResult.ok ? relationshipResult.data : null,
        };
      })()
    : null;

  return (
    <div className="flex flex-col gap-8">
      <RunAiDiscoveryPanel businessId={businessId} productId={productId} initialStages={pipelineStages} />
      {topGateRow && topGateContext ? (
        <TopOpportunityGate
          businessId={businessId}
          productId={productId}
          opportunity={topGateRow.opportunity}
          prospect={topGateRow.prospect}
          contactName={topGateContext.contactName}
          hasParty={topGateContext.hasParty}
          relationship={topGateContext.relationship}
          watchAction={updateTopOpportunityStatusAction.bind(null, businessId, productId, topGateRow.opportunity.id, "watching")}
          dismissAction={updateTopOpportunityStatusAction.bind(null, businessId, productId, topGateRow.opportunity.id, "dismissed")}
          sendToCrmAction={sendTopOpportunityToCrmAction.bind(
            null,
            businessId,
            productId,
            topGateRow.opportunity.id,
            topGateRow.prospect.id,
            topGateRow.prospect.party_id ?? "",
          )}
        />
      ) : null}
      {product.product_profile && prospectCounts ? (
        <OfferingOverviewSummary businessId={businessId} offering={product} icp={icp} personas={personas} prospectCounts={prospectCounts} />
      ) : null}
      <ProductOverviewShell
        product={product}
        sources={sources}
        websiteAction={updateProductWebsiteAction.bind(null, businessId, productId)}
        descriptionAction={updateProductDescriptionAction.bind(null, businessId, productId)}
        generateProfileAction={generateProductProfileAction.bind(null, businessId, productId)}
        addFileAction={addFileSourceAction.bind(null, businessId, productId, workspace.id)}
        addTextAction={addTextSourceAction.bind(null, businessId, productId, workspace.id)}
        updateSourceAction={updateSourceAction.bind(null, businessId, productId)}
        deleteSourceAction={deleteSourceAction.bind(null, businessId, productId)}
        nextHref={`${icpPath(businessId, productId)}?autopopulate=1`}
      />
    </div>
  );
}
