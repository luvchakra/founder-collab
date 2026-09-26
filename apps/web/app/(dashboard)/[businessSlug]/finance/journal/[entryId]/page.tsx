import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { getJournalEntry } from "@cofounderai/module-gst/lib/accounting/journal-queries";
import { JournalEntryDetailView } from "@cofounderai/module-gst/components/accounting/journal-entry-detail";
import { postJournalEntryAction, reverseJournalEntryAction } from "../actions";

/** One entry, its lines and why it exists. RLS makes "someone else's entry" and "no such
 * entry" the same thing, so both land on the same 404. */
export default async function JournalEntryPage({
  params,
}: {
  params: Promise<{ businessSlug: string; entryId: string }>;
}) {
  const { businessSlug, entryId } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const [entry, canPost] = await Promise.all([
    getJournalEntry(businessId, entryId),
    hasPermission(businessId, "gst.journal.create"),
  ]);
  if (!entry) notFound();

  const basePath = `/${businessSlug}/finance`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={entry.entry_number ?? "Journal entry"}
        description={entry.memo ?? undefined}
        breadcrumbs={[
          { label: "Journal", href: `${basePath}/journal` },
          { label: entry.entry_number ?? "Entry" },
        ]}
      />

      <JournalEntryDetailView
        entry={entry}
        accountsPath={`${basePath}/accounts`}
        sourceDocumentHref={entry.source_document_id ? `${basePath}/documents/${entry.source_document_id}` : null}
        canPost={canPost}
        postAction={postJournalEntryAction.bind(null, businessId, entryId)}
        reverseAction={reverseJournalEntryAction.bind(null, businessId, entryId)}
      />
    </div>
  );
}
