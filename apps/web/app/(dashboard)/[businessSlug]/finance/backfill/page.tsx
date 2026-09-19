import { notFound } from "next/navigation";
import Link from "next/link";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { ListChecks } from "lucide-react";
import { scanFinanceBackfill } from "@cofounderai/module-gst/lib/backfill/queries";
import { BackfillScanCard } from "@cofounderai/module-gst/components/backfill/backfill-scan-card";
import { businessPath } from "@/lib/business-path";
import { runFinanceBackfillAction } from "./actions";

/**
 * FIN-2 (Backfill, §41) -- scans for invoices, bills and payments that never reached the
 * ledger (typically because they were issued before this business licensed Finance) and
 * posts the eligible ones. Deliberately a scan-then-run screen rather than a fake preview
 * that predicts success ahead of time: whether an entry will actually post depends on the
 * chart of accounts being set up, which is exactly the state a preview would have to fake
 * to answer honestly. The counts here are what will be attempted; the run's own result is
 * what happened.
 */
export default async function FinanceBackfillPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const [scan, canRun, base] = await Promise.all([scanFinanceBackfill(businessId), hasPermission(businessId, "gst.journal.create"), businessPath(businessId)]);
  const total = scan.documents.length + scan.paymentAllocations.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Backfill"
        description="Catch up the ledger on history that predates Finance -- invoices, bills and payments that never posted."
      />

      {total === 0 ? (
        <EmptyState icon={ListChecks} message="Nothing to backfill -- every document and payment with an accounting consequence is already posted." />
      ) : (
        <BackfillScanCard
          documentCount={scan.documents.length}
          paymentCount={scan.paymentAllocations.length}
          canRun={canRun}
          runAction={runFinanceBackfillAction.bind(null, businessId)}
        />
      )}

      <p className="text-sm text-muted-foreground">
        Anything that can&apos;t post goes to the{" "}
        <Link href={`${base}/finance/exceptions`} className="text-primary hover:underline">
          exceptions queue
        </Link>{" "}
        instead of being dropped.
      </p>
    </div>
  );
}
