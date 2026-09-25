import { notFound } from "next/navigation";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { getDiligence, listDataRoomItems, listEntityActivity } from "@cofounderai/module-discovery/lib/funding/queries";
import { allowedDiligenceMoves } from "@cofounderai/module-discovery/lib/funding/lifecycle";
import { DATA_ROOM_CATEGORY_LABEL } from "@cofounderai/module-discovery/lib/funding/types";
import { ActionForm } from "@cofounderai/module-discovery/components/marketing/action-form";
import { Field } from "@cofounderai/module-discovery/components/marketing/field";
import { TransitionButtons } from "@cofounderai/module-discovery/components/marketing/transition-buttons";
import { ActivityTimeline } from "@cofounderai/module-discovery/components/marketing/activity-timeline";
import { DiligenceBadge, DataRoomBadge } from "@cofounderai/module-discovery/components/funding/status";
import { draftDiligenceWithAiAction, saveDiligenceResponseAction, transitionDiligenceAction } from "../../actions";
import { fundingContext } from "../../context";

/** FND-13 — one diligence request (§30.2): the request, the response, the data-room
 * documents that answer it, and its history. Linking a document here does not share it —
 * sharing is its own explicit action in the data room. */
export default async function DiligenceItemPage({ params }: { params: Promise<{ businessSlug: string; itemId: string }> }) {
  const { businessSlug, itemId } = await params;
  const { businessId, root, canView, canManage, canApprove } = await fundingContext(businessSlug);
  if (!canView) return null;
  const item = await getDiligence(businessId, itemId);
  if (!item) notFound();
  const [docs, activity] = await Promise.all([listDataRoomItems(businessId), listEntityActivity(businessId, "due_diligence_item", item.id)]);
  const decided = item.status === "accepted" || item.status === "closed";
  const moves = allowedDiligenceMoves(item.status).filter((to) => (to === "accepted" || to === "closed" ? canApprove : canManage));
  const linked = docs.filter((d) => item.dataRoomItemIds.includes(d.id));

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Diligence request <DiligenceBadge status={item.status} />
          </span>
        }
        description={`${item.investorName ?? item.requester ?? "Investor"}${item.dueAt ? ` · due ${item.dueAt}` : ""}`}
        breadcrumbs={[{ label: "Due diligence", href: `${root}/due-diligence` }, { label: item.request.slice(0, 40) }]}
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Request</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{item.request}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Response</CardTitle>
              {decided ? <CardDescription>This request has been {item.status}, so the response is kept as it was.</CardDescription> : null}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {canManage && !decided && !item.response ? (
                <ActionForm
                  action={draftDiligenceWithAiAction.bind(null, businessId, item.id)}
                  submitLabel="Draft a response with AI"
                  pendingText="Drafting..."
                  size="sm"
                  variant="secondary"
                  className="gap-2"
                >
                  <p className="text-xs text-muted-foreground">
                    Link the documents that answer it first. The draft fills the response box for you to edit; it is not submitted.
                  </p>
                </ActionForm>
              ) : null}
              {canManage && !decided ? (
                <ActionForm action={saveDiligenceResponseAction.bind(null, businessId, item.id)} submitLabel="Save response">
                  <Field label="Response" htmlFor="dd-response">
                    <Textarea id="dd-response" name="response" rows={8} defaultValue={item.response ?? ""} />
                  </Field>
                  <Field label="Internal notes" htmlFor="dd-notes">
                    <Textarea id="dd-notes" name="notes" rows={2} defaultValue={item.notes ?? ""} />
                  </Field>
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-sm font-medium">Evidence from the data room</legend>
                    {docs.length === 0 ? <p className="text-xs text-muted-foreground">No documents in the data room yet.</p> : null}
                    {docs.map((d) => (
                      <label key={d.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="dataRoomItemIds" value={d.id} defaultChecked={item.dataRoomItemIds.includes(d.id)} className="size-4" />
                        <span className="truncate">
                          {d.name} <span className="text-xs text-muted-foreground">({DATA_ROOM_CATEGORY_LABEL[d.category]})</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                </ActionForm>
              ) : (
                <div className="flex flex-col gap-3 text-sm">
                  <p className="whitespace-pre-wrap">{item.response ?? "No response yet."}</p>
                  {linked.length > 0 ? (
                    <ul className="flex flex-col gap-1">
                      {linked.map((d) => (
                        <li key={d.id} className="flex items-center gap-2">
                          {d.name} <DataRoomBadge status={d.status} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
              <CardDescription>
                {item.status === "submitted" && !canApprove ? "Waiting for someone with approval rights to accept it." : ""}
                {item.decidedAt ? `Decided ${new Date(item.decidedAt).toLocaleString("en-IN")}.` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TransitionButtons
                action={transitionDiligenceAction.bind(null, businessId, item.id)}
                targets={moves}
                labels={{
                  in_progress: "Start",
                  submitted: "Mark submitted",
                  accepted: "Accept",
                  needs_clarification: "Needs clarification",
                  closed: "Close",
                  open: "Reopen",
                }}
                destructive={["closed"]}
                confirmFor={{ accepted: "Record that the investor accepted this response?", closed: "Close this request? It cannot be reopened." }}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
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
