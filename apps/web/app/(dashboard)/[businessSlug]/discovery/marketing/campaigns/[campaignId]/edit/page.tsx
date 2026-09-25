import { notFound } from "next/navigation";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { getCampaign, listOfferingOptions } from "@cofounderai/module-discovery/lib/marketing/queries";
import { ActionForm } from "@cofounderai/module-discovery/components/marketing/action-form";
import { CampaignFields } from "@cofounderai/module-discovery/components/marketing/campaign-fields";
import { updateCampaignAction } from "../../../actions";
import { marketingContext } from "../../../context";

/** MKT-05 — edit a campaign's plan. Status changes happen on the campaign page. */
export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ businessSlug: string; campaignId: string }>;
}) {
  const { businessSlug, campaignId } = await params;
  const { businessId, root, canManage } = await marketingContext(businessSlug);
  if (!canManage) notFound();
  const [campaign, offerings] = await Promise.all([getCampaign(businessId, campaignId), listOfferingOptions(businessId)]);
  if (!campaign) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={`Edit ${campaign.name}`}
        breadcrumbs={[
          { label: "Campaigns", href: `${root}/campaigns` },
          { label: campaign.name, href: `${root}/campaigns/${campaign.id}` },
          { label: "Edit" },
        ]}
      />
      <ActionForm action={updateCampaignAction.bind(null, businessId, campaign.id)} submitLabel="Save changes" pendingText="Saving...">
        <CampaignFields campaign={campaign} offerings={offerings} />
      </ActionForm>
    </div>
  );
}
