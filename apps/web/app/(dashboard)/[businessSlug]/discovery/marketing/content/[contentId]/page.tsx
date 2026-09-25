import { notFound } from "next/navigation";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Input } from "@cofounderai/core/ui/input";
import {
  getContent,
  listCampaigns,
  listContentVersions,
  listEntityActivity,
  listOfferingOptions,
} from "@cofounderai/module-discovery/lib/marketing/queries";
import { allowedContentTransitions } from "@cofounderai/module-discovery/lib/marketing/lifecycle";
import { CONTENT_TYPE_LABEL, type ContentStatus } from "@cofounderai/module-discovery/lib/marketing/types";
import { ActionForm } from "@cofounderai/module-discovery/components/marketing/action-form";
import { ContentFields } from "@cofounderai/module-discovery/components/marketing/content-fields";
import { ContentStatusBadge } from "@cofounderai/module-discovery/components/marketing/status";
import { TransitionButtons } from "@cofounderai/module-discovery/components/marketing/transition-buttons";
import { ActivityTimeline } from "@cofounderai/module-discovery/components/marketing/activity-timeline";
import { Field } from "@cofounderai/module-discovery/components/marketing/field";
import { LocalDateTimeInput } from "@cofounderai/module-discovery/components/marketing/local-datetime-input";
import {
  duplicateContentAction,
  rescheduleContentAction,
  transitionContentAction,
  updateContentAction,
} from "../../actions";
import { marketingContext } from "../../context";

const ORIGIN_LABEL = {
  user: "Written by a person",
  ai_generated: "AI draft",
  ai_rewritten: "AI rewrite",
  ai_repurposed: "AI repurpose",
} as const;

/**
 * MKT-08/MKT-10 — the content editor (§12.5). Saving writes a new version (§12.6);
 * status moves are separate, explicit actions, and the two that put words in front of
 * customers — approve and publish — are shown only to people who hold marketing.approve
 * (the server checks again).
 */
export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ businessSlug: string; contentId: string }>;
}) {
  const { businessSlug, contentId } = await params;
  const { businessId, root, canManage, canApprove } = await marketingContext(businessSlug);
  const content = await getContent(businessId, contentId);
  if (!content) notFound();

  const [versions, offerings, campaigns, activity] = await Promise.all([
    listContentVersions(businessId, content.id),
    listOfferingOptions(businessId),
    listCampaigns(businessId),
    listEntityActivity(businessId, "marketing_content", content.id),
  ]);

  const allowed = allowedContentTransitions(content.status);
  const simple = allowed.filter((to) => {
    if (to === "scheduled" || to === "published") return false;
    if (to === "approved" && content.status === "review") return canApprove;
    return canManage;
  });
  const labels: Partial<Record<ContentStatus, string>> = {
    draft:
      content.status === "idea"
        ? "Start drafting"
        : content.status === "review"
          ? "Request changes"
          : content.status === "archived"
            ? "Restore as draft"
            : "Back to draft",
    review: "Send for review",
    approved: content.status === "scheduled" ? "Unschedule" : "Approve",
    archived: "Archive",
  };
  const transition = transitionContentAction.bind(null, businessId, content.id);
  const editable = canManage && content.status !== "published" && content.status !== "archived";

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {content.title} <ContentStatusBadge status={content.status} />
          </span>
        }
        description={`${CONTENT_TYPE_LABEL[content.contentType]}${content.campaignName ? ` · ${content.campaignName}` : ""}`}
        breadcrumbs={[{ label: "Content", href: `${root}/content` }, { label: content.title }]}
        actions={
          canManage ? (
            <ActionForm action={duplicateContentAction.bind(null, businessId, content.id)} inline submitLabel="Duplicate" variant="outline" />
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{editable ? "Edit" : "Content"}</CardTitle>
            <CardDescription>
              {content.status === "published"
                ? "Published content is kept exactly as it went out. Duplicate it to write a new version."
                : content.status === "approved" || content.status === "scheduled"
                  ? "Saving changes returns this to Draft, so it is reviewed again."
                  : "Every save is kept as a version."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {editable ? (
              <ActionForm action={updateContentAction.bind(null, businessId, content.id)} submitLabel="Save version" pendingText="Saving...">
                <ContentFields content={content} offerings={offerings} campaigns={campaigns} />
              </ActionForm>
            ) : (
              <article className="flex flex-col gap-3 text-sm">
                {content.summary ? <p className="text-muted-foreground">{content.summary}</p> : null}
                <div className="whitespace-pre-wrap">{content.body ?? "No body."}</div>
                {content.externalUrl ? (
                  <a href={content.externalUrl} target="_blank" rel="noopener noreferrer" className="break-all text-primary hover:underline">
                    {content.externalUrl}
                  </a>
                ) : null}
              </article>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
              <CardDescription>
                {content.scheduledAt ? `Scheduled for ${new Date(content.scheduledAt).toLocaleString("en-IN")}. ` : ""}
                {content.publishedAt ? `Published ${new Date(content.publishedAt).toLocaleString("en-IN")}.` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <TransitionButtons
                action={transition}
                targets={simple}
                labels={labels}
                destructive={["archived"]}
                confirmFor={{ archived: "Archive this content?" }}
              />
              {allowed.includes("scheduled") && canManage ? (
                <ActionForm action={transition} submitLabel="Schedule" variant="secondary" size="sm">
                  <input type="hidden" name="to" value="scheduled" />
                  <Field label="Publish on" htmlFor="scheduledAt" hint="Scheduling only reserves the date. Someone still publishes it.">
                    <LocalDateTimeInput id="scheduledAt" name="scheduledAt" required />
                  </Field>
                </ActionForm>
              ) : null}
              {content.status === "scheduled" && canManage ? (
                <ActionForm action={rescheduleContentAction.bind(null, businessId, content.id)} submitLabel="Reschedule" variant="outline" size="sm">
                  <Field label="New date" htmlFor="rescheduleAt">
                    <LocalDateTimeInput id="rescheduleAt" name="scheduledAt" required defaultValue={content.scheduledAt} />
                  </Field>
                </ActionForm>
              ) : null}
              {allowed.includes("published") && canApprove ? (
                <ActionForm
                  action={transition}
                  submitLabel="Mark as published"
                  size="sm"
                  confirm="Mark this as published? The approved version will be recorded as the one that went out."
                >
                  <input type="hidden" name="to" value="published" />
                  <Field label="Where it was published" htmlFor="externalUrl" hint="Optional link to the live post or page.">
                    <Input id="externalUrl" name="externalUrl" type="url" placeholder="https://" />
                  </Field>
                </ActionForm>
              ) : null}
              {content.status === "review" && !canApprove ? (
                <p className="text-xs text-muted-foreground">Waiting for someone with approval rights.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Versions</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-2 text-sm">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-baseline justify-between gap-2">
                    <span>
                      v{v.versionNumber} · {ORIGIN_LABEL[v.origin]}
                      {v.id === content.publishedVersionId ? <span className="ml-1 text-xs font-medium text-success-subtle">published</span> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleDateString("en-IN")}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline entries={activity} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
