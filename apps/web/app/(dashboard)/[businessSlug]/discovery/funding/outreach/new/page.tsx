import { notFound } from "next/navigation";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { Card, CardContent } from "@cofounderai/core/ui/card";
import { getInvestor, listInvestorContacts, listInvestors, listRounds } from "@cofounderai/module-discovery/lib/funding/queries";
import { ActionForm } from "@cofounderai/module-discovery/components/marketing/action-form";
import { OutreachFields } from "@cofounderai/module-discovery/components/funding/outreach-fields";
import { createOutreachAction } from "../../actions";
import { fundingContext } from "../../context";

/** FND-11 — a new outreach draft. Opened from an investor's page, it knows who it is for
 * and lists that investor's contacts. */
export default async function NewOutreachPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ businessSlug }, sp] = await Promise.all([params, searchParams]);
  const { businessId, root, canView, canManage } = await fundingContext(businessSlug);
  if (!canView) return null;
  if (!canManage) notFound();
  const investorId = typeof sp.investor === "string" ? sp.investor : null;
  const [investors, rounds, investor] = await Promise.all([
    listInvestors(businessId),
    listRounds(businessId),
    investorId ? getInvestor(businessId, investorId) : Promise.resolve(null),
  ]);
  const contacts = investor ? await listInvestorContacts(businessId, investor.partyId) : [];
  const live = rounds.filter((r) => ["planning", "open", "paused"].includes(r.status));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="New outreach draft" breadcrumbs={[{ label: "Investor outreach", href: `${root}/outreach` }, { label: "New" }]} />
      <Card>
        <CardContent className="pt-6">
          <ActionForm action={createOutreachAction.bind(null, businessId)} submitLabel="Save draft" pendingText="Saving...">
            <OutreachFields investors={investors} contacts={contacts} rounds={live} defaultInvestorId={investor?.id ?? null} />
          </ActionForm>
          {!investor ? (
            <p className="mt-3 text-xs text-muted-foreground">To address a specific person, start the draft from the investor&apos;s page.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
