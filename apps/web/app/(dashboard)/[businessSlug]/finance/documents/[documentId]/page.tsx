import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { getDocumentLedger } from "@cofounderai/module-gst/lib/accounting/document-posting-queries";
import { documentLabel } from "@cofounderai/module-gst/lib/accounting/document-postings";
import { DocumentLedgerView } from "@cofounderai/module-gst/components/accounting/document-ledger-view";

/**
 * FIN-12 — from a source document to the entries it caused. The reverse of the journal
 * entry page's "Why this entry exists": reached from the invoices list, and from any entry
 * that names a source document. Someone else's document and no such document are the same
 * 404.
 */
export default async function FinanceDocumentLedgerPage({
  params,
}: {
  params: Promise<{ businessSlug: string; documentId: string }>;
}) {
  const { businessSlug, documentId } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const ledger = await getDocumentLedger(businessId, documentId);
  if (!ledger) notFound();

  const basePath = `/${businessSlug}/finance`;
  const title = documentLabel(ledger.document.doc_type, ledger.document.number);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description="What this document did to your books: every entry it caused, why, and the net effect."
        breadcrumbs={[
          ledger.document.doc_type === "invoice"
            ? { label: "Invoices", href: `${basePath}/invoices` }
            : { label: "Journal", href: `${basePath}/journal` },
          { label: title },
        ]}
      />
      <DocumentLedgerView
        ledger={ledger}
        journalPath={`${basePath}/journal`}
        accountPath={(accountId) => `${basePath}/accounts/${accountId}`}
      />
    </div>
  );
}
