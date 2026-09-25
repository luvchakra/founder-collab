import { notFound } from "next/navigation";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { listCampaigns, listOfferingOptions } from "@cofounderai/module-discovery/lib/marketing/queries";
import { ActionForm } from "@cofounderai/module-discovery/components/marketing/action-form";
import { ContentFields } from "@cofounderai/module-discovery/components/marketing/content-fields";
import { createContentAction } from "../../actions";
import { marketingContext } from "../../context";

/** MKT-08 — new content. With a body it starts as a Draft; without one, as an Idea. */
export default async function NewContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ businessSlug }, sp] = await Promise.all([params, searchParams]);
  const { businessId, root, canManage } = await marketingContext(businessSlug);
  if (!canManage) notFound();
  const [offerings, campaigns] = await Promise.all([listOfferingOptions(businessId), listCampaigns(businessId)]);
  const defaultCampaignId = typeof sp.campaign === "string" && campaigns.some((c) => c.id === sp.campaign) ? sp.campaign : null;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="New content" breadcrumbs={[{ label: "Content", href: `${root}/content` }, { label: "New" }]} />
      <ActionForm action={createContentAction.bind(null, businessId)} submitLabel="Save" pendingText="Saving...">
        <ContentFields offerings={offerings} campaigns={campaigns} defaultCampaignId={defaultCampaignId} />
      </ActionForm>
    </div>
  );
}
