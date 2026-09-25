import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { Button } from "@cofounderai/core/ui/button";
import { Card, CardContent } from "@cofounderai/core/ui/card";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { listCampaignMetrics, listCampaigns, listOfferingOptions } from "@cofounderai/module-discovery/lib/marketing/queries";
import { parsePeriod, periodWindow } from "@cofounderai/module-discovery/lib/marketing/period";
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABEL,
  MARKETING_CHANNELS,
  MARKETING_CHANNEL_LABEL,
  type CampaignStatus,
  type MarketingChannel,
} from "@cofounderai/module-discovery/lib/marketing/types";
import { UrlSelect } from "@cofounderai/module-discovery/components/marketing/url-select";
import { CampaignPerformance } from "@cofounderai/module-discovery/components/marketing/campaign-performance";
import { marketingContext } from "../context";

/** MKT-05 — the campaign list, filtered in the URL and on the server. */
export default async function CampaignsPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ businessSlug }, sp] = await Promise.all([params, searchParams]);
  const { businessId, root, canManage } = await marketingContext(businessSlug);

  const status = (CAMPAIGN_STATUSES as readonly string[]).includes(String(sp.status)) ? (sp.status as CampaignStatus) : "all";
  const channel = (MARKETING_CHANNELS as readonly string[]).includes(String(sp.channel)) ? (sp.channel as MarketingChannel) : "all";
  const offeringId = typeof sp.offering === "string" && sp.offering ? sp.offering : undefined;
  const sort = sp.sort === "name" || sp.sort === "end_date" ? sp.sort : "newest";

  const [campaigns, offerings] = await Promise.all([
    listCampaigns(businessId, { status, channel, offeringId, sort }),
    listOfferingOptions(businessId),
  ]);
  // Performance columns cover the last 12 months — stated, not implied.
  const metrics = await listCampaignMetrics(businessId, periodWindow(parsePeriod("365d")), campaigns.map((c) => c.id));

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Figures cover the last 12 months of recorded results."
        actions={
          canManage ? (
            <Button asChild size="sm">
              <Link href={`${root}/campaigns/new`}>
                <Plus className="size-4" aria-hidden="true" /> Create campaign
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <UrlSelect
          name="status"
          label="Status"
          value={status}
          options={[
            { value: "all", label: "All but archived" },
            ...CAMPAIGN_STATUSES.map((s) => ({ value: s, label: CAMPAIGN_STATUS_LABEL[s] })),
          ]}
        />
        <UrlSelect
          name="channel"
          label="Channel"
          value={channel}
          options={[{ value: "all", label: "All channels" }, ...MARKETING_CHANNELS.map((c) => ({ value: c, label: MARKETING_CHANNEL_LABEL[c] }))]}
        />
        <UrlSelect
          name="offering"
          label="Offering"
          value={offeringId ?? ""}
          options={[{ value: "", label: "All offerings" }, ...offerings.map((o) => ({ value: o.id, label: o.name }))]}
        />
        <UrlSelect
          name="sort"
          label="Sort"
          value={sort}
          options={[
            { value: "newest", label: "Newest first" },
            { value: "name", label: "Name" },
            { value: "end_date", label: "Ending soonest" },
          ]}
        />
      </div>
      <Card>
        <CardContent className="pt-6">
          {campaigns.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              message={status === "all" && channel === "all" && !offeringId ? "No campaigns yet." : "No campaigns match these filters."}
            />
          ) : (
            <CampaignPerformance campaigns={campaigns} metrics={metrics} root={root} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
