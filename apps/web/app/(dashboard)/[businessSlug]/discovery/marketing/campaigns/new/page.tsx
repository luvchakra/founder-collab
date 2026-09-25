import { notFound } from "next/navigation";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { listOfferingOptions } from "@cofounderai/module-discovery/lib/marketing/queries";
import { ActionForm } from "@cofounderai/module-discovery/components/marketing/action-form";
import { CampaignFields } from "@cofounderai/module-discovery/components/marketing/campaign-fields";
import { createCampaignAction } from "../../actions";
import { marketingContext } from "../../context";

/** MKT-05 — create a campaign (§9.3). Always saved as a draft. */
export default async function NewCampaignPage({ params }: { params: Promise<{ businessSlug: string }> }) {
  const { businessSlug } = await params;
  const { businessId, root, canManage } = await marketingContext(businessSlug);
  if (!canManage) notFound();
  const offerings = await listOfferingOptions(businessId);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="New campaign"
        breadcrumbs={[{ label: "Campaigns", href: `${root}/campaigns` }, { label: "New" }]}
      />
      <ActionForm action={createCampaignAction.bind(null, businessId)} submitLabel="Save as draft" pendingText="Saving...">
        <CampaignFields offerings={offerings} />
      </ActionForm>
    </div>
  );
}
