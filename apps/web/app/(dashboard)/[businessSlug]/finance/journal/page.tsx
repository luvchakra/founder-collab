import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { Button } from "@cofounderai/core/ui/button";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { listJournalEntries } from "@cofounderai/module-gst/lib/accounting/journal-queries";
import { JournalList } from "@cofounderai/module-gst/components/accounting/journal-list";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

/**
 * Finance F2 — the journal: every entry in the ledger, automatic and manual alike.
 *
 * Deliberately one undivided list rather than separate "automatic" and "manual" tabs:
 * the ledger is one ledger, and an account's balance is the sum of both kinds. Where an
 * entry came from is a column, not a separate screen.
 */
export default async function FinanceJournalPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const [entries, canCreate] = await Promise.all([
    listJournalEntries(businessId),
    hasPermission(businessId, "gst.journal.create"),
  ]);
  const basePath = `/${businessSlug}/finance/journal`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Journal"
        description="Every entry in your ledger. Invoices, bills and payments post here automatically; adjustments and corrections you add by hand."
        actions={
          <>
            <ExportMenu exportId="finance.journal" businessSlug={businessSlug} />
            {canCreate ? (
              <Button asChild size="sm">
                <Link href={`${basePath}/new`}>
                  <Plus className="size-4" aria-hidden="true" />
                  New entry
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <JournalList entries={entries} basePath={basePath} />
    </div>
  );
}
