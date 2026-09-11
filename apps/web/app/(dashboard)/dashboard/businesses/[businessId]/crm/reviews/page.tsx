import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-crm/lib/tenancy/queries";
import { listChannelConnections } from "@cofounderai/module-crm/lib/channel-connections/queries";
import { listReviewItems } from "@cofounderai/module-crm/lib/reviews/queries";
import type { ReviewItemStatus } from "@cofounderai/module-crm/lib/reviews/types";
import { formatDate } from "@cofounderai/core/lib/format";
import { Badge } from "@cofounderai/core/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@cofounderai/core/ui/table";
import { Star, StarHalf } from "lucide-react";
import { connectGoogleBusinessProfileAction, disconnectGoogleBusinessProfileAction, syncGoogleBusinessProfileReviewsAction } from "./actions";
import { ConnectGoogleBusinessProfileForm } from "./connect-form";

const STATUS_VARIANT: Record<ReviewItemStatus, "default" | "secondary" | "outline"> = {
  new: "outline",
  in_progress: "secondary",
  responded: "default",
  dismissed: "outline",
};
const STATUS_LABEL: Record<ReviewItemStatus, string> = {
  new: "Awaiting reply",
  in_progress: "In progress",
  responded: "Replied",
  dismissed: "Dismissed",
};

function RatingStars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-xs text-muted-foreground">No rating</span>;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
      ))}
    </span>
  );
}

/**
 * CRM-08.5 ("Google Business Profile Review Inbox"): connect one or more locations, then
 * see every review for them in one reputation queue -- rating, comment, reviewer, when
 * it was posted, and its reply state, per the story's own acceptance criteria.
 * Publishing a reply from here is CRM-08.6's own separate P1 story (not built:
 * `reviews.publish` is already seeded in the permission catalog for it, per
 * docs/design/crm-backlog-audit.md), so this page is read-only over the review data
 * itself -- listing and syncing only.
 */
export default async function CrmReviewsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await getBusiness(businessId);
  if (!business) notFound();

  const [connections, reviews] = await Promise.all([listChannelConnections(businessId), listReviewItems(businessId)]);
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
        <div className="rounded-2xl border border-border">
          <ul className="divide-y md:hidden">
            {reviews.map((review) => (
              <li key={review.id} className="flex flex-col gap-2 p-3 text-sm">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <span className="min-w-0 break-words font-medium">{review.reviewer_name ?? "Anonymous"}</span>
                  <Badge variant={STATUS_VARIANT[review.status]} className="shrink-0">
                    {STATUS_LABEL[review.status]}
                  </Badge>
                </div>
                <RatingStars rating={review.rating} />
                <p className="text-muted-foreground">{review.comment_excerpt ?? "(no comment)"}</p>
                <span className="text-xs text-muted-foreground">{formatDate(review.occurred_at)}</span>
              </li>
            ))}
          </ul>

          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Rating</TableHead>
                <TableHead>Reviewer</TableHead>
                <TableHead>Comment</TableHead>
                <TableHead>Posted</TableHead>
                <TableHead>Reply state</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviews.map((review) => (
                <TableRow key={review.id}>
                  <TableCell>
                    <RatingStars rating={review.rating} />
                  </TableCell>
                  <TableCell className="font-medium">{review.reviewer_name ?? "Anonymous"}</TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground">{review.comment_excerpt ?? "(no comment)"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(review.occurred_at)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[review.status]}>{STATUS_LABEL[review.status]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
