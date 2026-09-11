import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { listChannelConnections } from "@cofounderai/module-crm/lib/channel-connections/queries";
import { listReviewItems } from "@cofounderai/module-crm/lib/reviews/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { formatDate } from "@cofounderai/core/lib/format";
import { Badge } from "@cofounderai/core/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { StarHalf } from "lucide-react";
import {
  connectGoogleBusinessProfileAction,
  disconnectGoogleBusinessProfileAction,
  generateReviewDraftAction,
  publishReviewResponseAction,
  syncGoogleBusinessProfileReviewsAction,
} from "./actions";
import { ConnectGoogleBusinessProfileForm } from "./connect-form";
import { ReviewsList } from "./reviews-list";

/**
 * CRM-08.5 ("Google Business Profile Review Inbox") + CRM-08.6 ("Review Response
 * Drafting"): connect one or more locations, see every review for them in one
 * reputation queue, and -- when the signed-in member holds `reviews.publish` -- draft
 * and publish a reply per review (`ReviewsList`'s own dialog; see its doc comment for
 * how drafting/approval/publishing are actually gated).
 */
export default async function CrmReviewsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [connections, reviews, canRespond] = await Promise.all([
    listChannelConnections(businessId),
    listReviewItems(businessId),
    hasPermission(businessId, "reviews.publish"),
  ]);
  const gbpConnections = connections.filter((c) => c.channel === "google_business_profile" && c.status !== "disconnected");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Reviews</h1>
        <p className="mt-1 text-sm text-muted-foreground">{business.name}&apos;s Google Business Profile reputation queue.</p>
      </div>

      <Card className="mx-auto w-full max-w-lg">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Connected locations</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {gbpConnections.length > 0 ? (
            <ul className="flex flex-col divide-y">
              {gbpConnections.map((connection) => (
                <li key={connection.id} className="flex flex-col gap-2 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 break-all font-medium">{connection.external_account_id}</span>
                    <Badge variant={connection.status === "connected" ? "secondary" : "destructive"}>{connection.status.replaceAll("_", " ")}</Badge>
                  </div>
                  {connection.last_synced_at ? <p className="text-xs text-muted-foreground">Last synced {formatDate(connection.last_synced_at)}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    <form action={syncGoogleBusinessProfileReviewsAction.bind(null, businessId, connection.id)}>
                      <SubmitButton size="sm" variant="outline" pendingText="Syncing...">
                        Sync now
                      </SubmitButton>
                    </form>
                    <form action={disconnectGoogleBusinessProfileAction.bind(null, businessId, connection.id)}>
                      <SubmitButton size="sm" variant="ghost" pendingText="Disconnecting...">
                        Disconnect
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          <div className={gbpConnections.length > 0 ? "border-t pt-4" : ""}>
            {gbpConnections.length > 0 ? <p className="pb-2 text-xs text-muted-foreground">Connect another location:</p> : null}
            <ConnectGoogleBusinessProfileForm action={connectGoogleBusinessProfileAction.bind(null, businessId)} />
          </div>
        </CardContent>
      </Card>

      {reviews.length === 0 ? (
        <EmptyState icon={StarHalf} message="No reviews yet -- connect a location above and sync to pull them in." />
      ) : (
        <ReviewsList
          businessId={businessId}
          reviews={reviews}
          canRespond={canRespond}
          generateDraftAction={generateReviewDraftAction.bind(null, businessId)}
          publishAction={publishReviewResponseAction.bind(null, businessId)}
        />
      )}
    </div>
  );
}
