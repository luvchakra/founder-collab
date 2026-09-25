import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { getInvestor, getOutreach, listEntityActivity, listInvestorContacts, listRounds } from "@cofounderai/module-discovery/lib/funding/queries";
import { allowedOutreachMoves } from "@cofounderai/module-discovery/lib/funding/lifecycle";
import type { OutreachStatus } from "@cofounderai/module-discovery/lib/funding/types";
import { ActionForm } from "@cofounderai/module-discovery/components/marketing/action-form";
import { TransitionButtons } from "@cofounderai/module-discovery/components/marketing/transition-buttons";
import { ActivityTimeline } from "@cofounderai/module-discovery/components/marketing/activity-timeline";
import { OutreachFields } from "@cofounderai/module-discovery/components/funding/outreach-fields";
import { OutreachBadge } from "@cofounderai/module-discovery/components/funding/status";
import { sendOutreachAction, transitionOutreachAction, updateOutreachAction } from "../../actions";
import { fundingContext } from "../../context";

const LABELS: Partial<Record<OutreachStatus, string>> = {
  awaiting_approval: "Submit for approval",
  approved: "Approve",
  draft: "Back to draft",
  replied: "Mark replied",
  closed: "Close",
};

/**
 * FND-11 — one outreach draft. Editing withdraws any approval; approving and sending need
 * funding.approve and are separate clicks; the recorded result is the email provider's.
 */
export default async function OutreachDetailPage({ params }: { params: Promise<{ businessSlug: string; outreachId: string }> }) {
  const { businessSlug, outreachId } = await params;
  const { businessId, root, canView, canManage, canApprove } = await fundingContext(businessSlug);
  if (!canView) return null;
  const draft = await getOutreach(businessId, outreachId);
  if (!draft) notFound();
  const [investor, rounds, activity] = await Promise.all([
    getInvestor(businessId, draft.investorId),
    listRounds(businessId),
    listEntityActivity(businessId, "investor_outreach", draft.id),
  ]);
  const contacts = investor ? await listInvestorContacts(businessId, investor.partyId) : [];
  const recipient = draft.contactId ? contacts.find((c) => c.id === draft.contactId)?.email : investor?.email;
  const editable = canManage && ["draft", "awaiting_approval", "approved", "failed"].includes(draft.status);
  const moves = allowedOutreachMoves(draft.status).filter((to) => (to === "approved" ? canApprove : canManage));

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {draft.subject} <OutreachBadge status={draft.status} />
          </span>
        }
        description={
          <>
            To{" "}
            {investor ? (
              <Link href={`${root}/investors/${investor.id}`} className="text-primary hover:underline">
                {investor.name}
              </Link>
            ) : (
              "investor"
            )}
            {recipient ? ` <${recipient}>` : " — no email address on file"}
            {draft.origin === "ai_draft" ? " · AI draft" : ""}
          </>
        }
        breadcrumbs={[{ label: "Investor outreach", href: `${root}/outreach` }, { label: draft.subject }]}
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{editable ? "Draft" : "Message"}</CardTitle>
            {draft.status === "approved" ? <CardDescription>Approved. Editing it will need approval again.</CardDescription> : null}
          </CardHeader>
          <CardContent>
            {editable ? (
              <ActionForm action={updateOutreachAction.bind(null, businessId, draft.id)} submitLabel="Save draft">
                <OutreachFields draft={draft} investors={[]} contacts={contacts} rounds={rounds} />
              </ActionForm>
            ) : (
              <div className="whitespace-pre-wrap text-sm">{draft.body}</div>
            )}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
              <CardDescription>
                {draft.status === "sent" && draft.sentAt
                  ? `Sent ${new Date(draft.sentAt).toLocaleString("en-IN")} to ${draft.recipientEmail}. Provider id ${draft.providerMessageId}.`
                  : draft.status === "failed"
                    ? `Not sent: ${(draft.failureReason ?? "unknown reason").replace(/\.+$/, "")}. Move it back to draft, fix it and approve again.`
                    : draft.status === "sending"
                      ? "A send is in progress, or was interrupted. Check the recipient's inbox before doing anything else."
                      : draft.status === "awaiting_approval" && !canApprove
                        ? "Waiting for someone with approval rights."
                        : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <TransitionButtons
                action={transitionOutreachAction.bind(null, businessId, draft.id)}
                targets={moves}
                labels={LABELS}
                destructive={["closed"]}
              />
              {draft.status === "approved" && canApprove ? (
                <ActionForm
                  action={sendOutreachAction.bind(null, businessId, draft.id)}
                  submitLabel={recipient ? `Send to ${recipient}` : "Send"}
                  pendingText="Sending..."
                  confirm={`Send this email to ${recipient ?? "the investor"} now?`}
                />
              ) : null}
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
