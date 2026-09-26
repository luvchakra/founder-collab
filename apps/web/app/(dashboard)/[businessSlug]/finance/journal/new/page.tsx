import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { BookOpen } from "lucide-react";
import { listAccounts } from "@cofounderai/module-gst/lib/accounting/queries";
import { getDimensionSettings } from "@cofounderai/module-gst/lib/dimensions/queries";
import { JournalEntryForm } from "@cofounderai/module-gst/components/accounting/journal-entry-form";
import { createJournalEntryAction } from "../actions";

/** A manual journal entry. Needs a chart of accounts to post into, so it says so rather
 * than offering an empty account picker. */
export default async function NewJournalEntryPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const canCreate = await hasPermission(businessId, "gst.journal.create");
  if (!canCreate) notFound();

  const [accounts, dimensionSettings] = await Promise.all([listAccounts(businessId), getDimensionSettings(businessId)]);
  // FIN-9: only the free-text dimensions the business switched on get a field.
  const dimension = (key: "location" | "project") => dimensionSettings.find((d) => d.key === key && d.enabled)?.label;
  const basePath = `/${businessSlug}/finance`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="New journal entry"
        description="An adjustment, accrual or correction. Debits and credits have to match before it can be posted."
        breadcrumbs={[{ label: "Journal", href: `${basePath}/journal` }, { label: "New entry" }]}
      />

      {accounts.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          message="Set up your chart of accounts first — an entry needs accounts to post into."
        />
      ) : (
        <JournalEntryForm
          accounts={accounts}
          action={createJournalEntryAction.bind(null, businessId)}
          cancelHref={`${basePath}/journal`}
          dimensions={{ location: dimension("location"), project: dimension("project") }}
        />
      )}
    </div>
  );
}
