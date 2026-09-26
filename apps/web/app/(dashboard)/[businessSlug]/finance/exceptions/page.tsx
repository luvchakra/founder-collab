import { notFound } from "next/navigation";
import { resolveBusinessIdBySlug } from "@cofounderai/core/businesses/resolve";
import { createClient } from "@cofounderai/core/db/server";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { PageHeader } from "@cofounderai/core/ui/page-header";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { listFinanceExceptions } from "@cofounderai/module-gst/lib/exceptions-queue/queries";
import { FinanceExceptionsList } from "@cofounderai/module-gst/components/exceptions/finance-exceptions-list";
import {
  syncFinanceExceptionsAction,
  startReviewFinanceExceptionAction,
  reopenFinanceExceptionAction,
  resolveFinanceExceptionAction,
  ignoreFinanceExceptionAction,
  claimFinanceExceptionAction,
  unclaimFinanceExceptionAction,
} from "./actions";
import { ExportMenu } from "@cofounderai/core/export-ui/export-menu";

/**
 * FIN-1 (Finance exceptions queue, §38) -- one place for what otherwise sits scattered
 * across the dashboard (unposted documents), the GST ledger (ITC at risk) and filing
 * readiness (blockers). Those three screens keep their own live views; this is the triage
 * queue on top: what happened, why it matters, what to do, who owns it, and where it
 * stands (Open, In Review, Resolved, Ignored).
 *
 * Sync is a manual action, not automatic on every page load, same reasoning as the
 * reconciliation queue's own sync button: it's a write (inserts new rows), and a page load
 * is a read.
 */
export default async function FinanceExceptionsPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const businessId = await resolveBusinessIdBySlug(businessSlug);
  if (!businessId) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [exceptions, canManage] = await Promise.all([
    listFinanceExceptions(businessId),
    hasPermission(businessId, "gst.exceptions.manage"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Exceptions"
        description="What needs your attention across accounting, GST and filing -- one queue instead of three screens."
        actions={<ExportMenu exportId="finance.exceptions" businessSlug={businessSlug} />}
      />

      {canManage ? (
        <div className="flex justify-end">
          <form action={syncFinanceExceptionsAction.bind(null, businessId)}>
            <SubmitButton variant="outline" size="sm" pendingText="Checking...">
              Check for new exceptions
            </SubmitButton>
          </form>
        </div>
      ) : null}

      <FinanceExceptionsList
        exceptions={exceptions}
        viewerId={user?.id ?? null}
        reviewAction={startReviewFinanceExceptionAction.bind(null, businessId)}
        reopenAction={reopenFinanceExceptionAction.bind(null, businessId)}
        resolveAction={resolveFinanceExceptionAction.bind(null, businessId)}
        ignoreAction={ignoreFinanceExceptionAction.bind(null, businessId)}
        claimAction={claimFinanceExceptionAction.bind(null, businessId)}
        unclaimAction={unclaimFinanceExceptionAction.bind(null, businessId)}
      />
    </div>
  );
}
