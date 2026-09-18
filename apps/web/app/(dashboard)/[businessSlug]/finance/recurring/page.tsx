import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { listRecurringEntries } from "@cofounderai/module-gst/lib/accounting/recurring-queries";
import { listAccounts } from "@cofounderai/module-gst/lib/accounting/queries";
import { RecurringEntriesView } from "@cofounderai/module-gst/components/accounting/recurring-entries-view";
import { createRecurringEntryAction, setRecurringEntryActiveAction } from "./actions";

/** Finance F10 — entries that post themselves: rent, depreciation, subscriptions. */
export default async function RecurringEntriesPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const [entries, accounts, canManage] = await Promise.all([
    listRecurringEntries(businessId),
    listAccounts(businessId),
    hasPermission(businessId, "gst.journal.create"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Recurring entries"
        description="Anything you post the same way every period. Set it up once and it posts itself, catching up if a run is ever missed."
      />
      <RecurringEntriesView
        entries={entries}
        accounts={accounts}
        canManage={canManage}
        createAction={createRecurringEntryAction.bind(null, businessId)}
        setActiveAction={setRecurringEntryActiveAction.bind(null, businessId)}
      />
    </div>
  );
}
