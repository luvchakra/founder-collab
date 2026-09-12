import { notFound } from "next/navigation";
import { getBusiness } from "@cofounderai/module-gst/lib/tenancy/queries";
import { listReconciliationExceptions } from "@cofounderai/module-gst/lib/exceptions/queries";
import { hasPermission } from "@cofounderai/core/rbac/require-permission";
import { Label } from "@cofounderai/core/ui/label";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { ExceptionsList } from "@cofounderai/module-gst/components/reconciliation/exceptions-list";
import { syncReconciliationExceptionsAction, resolveExceptionAction, dismissExceptionAction } from "./actions";

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * COMPLY-P0-08.6/COMPLY-P0-11 (Reconciliation Exceptions UI): the first real screen for
 * this whole epic's own exception queue (COMPLY-P0-08.2 matching, COMPLY-P0-08.4 IMS,
 * COMPLY-P0-08.6 the queue itself) -- until this page, every one of those stories was
 * lib-only, each explicitly deferring "a real UI" to this epic. Same `?period=YYYY-MM`
 * convention as `gst/filing/page.tsx` (a plain GET form, full page reload).
 */
export default async function ComplianceReconciliationPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { businessId } = await params;
  const { period: periodParam } = await searchParams;
  const period = periodParam || currentPeriod();

  const [business, exceptions, canManage] = await Promise.all([
    getBusiness(businessId),
    listReconciliationExceptions(businessId, period),
    hasPermission(businessId, "gst.manage_reconciliation"),
  ]);
  if (!business) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Reconciliation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          GSTR-2B matching and IMS exceptions for {business.name}, by return period.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <form method="GET" className="flex flex-col gap-1.5">
          <Label htmlFor="reconciliation-period">Period</Label>
          <input
            id="reconciliation-period"
            name="period"
            type="month"
            defaultValue={period}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="border-input flex h-9 w-48 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm"
          />
        </form>
        {canManage ? (
          <form action={syncReconciliationExceptionsAction.bind(null, businessId, period)}>
            <SubmitButton variant="outline" size="sm" pendingText="Syncing...">
              Sync exceptions
            </SubmitButton>
          </form>
        ) : null}
      </div>

      <ExceptionsList
        exceptions={exceptions}
        resolveAction={resolveExceptionAction.bind(null, businessId)}
        dismissAction={dismissExceptionAction.bind(null, businessId)}
      />
    </div>
  );
}
