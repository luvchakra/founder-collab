// EXP-FIN-15 -- Finance Exceptions export (/finance/exceptions), and the GSTR-2B / IMS
// reconciliation exception queue (/finance/reconciliation), which is the same kind of
// list for the return side (EXP-FIN-08's "reconciliation").
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { listAuditActors } from "@cofounderai/core/audit/queries";
import { listReconciliationExceptions } from "../lib/exceptions/queries";
import type { ReconciliationException } from "../lib/exceptions/types";
import { listFinanceExceptions } from "../lib/exceptions-queue/queries";
import type { FinanceException } from "../lib/exceptions-queue/types";
import {
  FINANCE_EXCEPTION_STATUS_LABEL,
  FINANCE_EXCEPTION_TYPE_LABEL,
  RECONCILIATION_EXCEPTION_STATUS_LABEL,
  RECONCILIATION_EXCEPTION_TYPE_LABEL,
} from "./labels";
import { calendarPeriodParam } from "./periods";
import { FINANCE_FILE_MODULE, FINANCE_LICENCE, FINANCE_READ_PERMISSIONS } from "./shared";

/** A member's name for an id the queue stores (owner, resolver) -- the same join the
 * audit log page uses; an id no longer in the business stays as the id. */
async function memberNames(businessId: string): Promise<(id: string | null) => string | null> {
  const actors = await listAuditActors(businessId);
  const byId = new Map(actors.map((a) => [a.id, a.name]));
  return (id) => (id ? byId.get(id) ?? id : null);
}

/** Queue references are a document id, a `YYYY-MM` period, or `YYYY-MM:<check>`; the
 * period, when there is one, is its own column. */
function periodOf(reference: string): string | null {
  return /^\d{4}-\d{2}(?::|$)/.test(reference) ? reference.slice(0, 7) : null;
}

/**
 * The whole queue as the page lists it (`listFinanceExceptions(businessId)`, every status,
 * oldest first). The queue records no severity; its "impact" line is what the page shows
 * in that place and is exported as such. The page reads with no permission check
 * (`gst.exceptions.manage` only enables triage).
 */
export const financeExceptionsExport: ExportAdapter<Record<string, never>> = {
  id: "finance.exceptions",
  module: FINANCE_LICENCE,
  permissions: FINANCE_READ_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const [exceptions, name] = await Promise.all([
      listFinanceExceptions(context.businessId),
      memberNames(context.businessId),
    ]);
    return {
      module: FINANCE_FILE_MODULE,
      resource: "exceptions",
      title: "Finance exceptions",
      sheets: [
        {
          sheetName: "Exceptions",
          rows: exceptions,
          columns: [
            { key: "exception", header: "Exception", getValue: (e: FinanceException) => e.summary },
            {
              key: "category",
              header: "Category",
              getValue: (e: FinanceException) => FINANCE_EXCEPTION_TYPE_LABEL[e.exceptionType] ?? e.exceptionType,
            },
            { key: "impact", header: "Impact", getValue: (e: FinanceException) => e.impact },
            { key: "reference", header: "Reference", getValue: (e: FinanceException) => e.referenceKey },
            { key: "period", header: "Period", getValue: (e: FinanceException) => periodOf(e.referenceKey) },
            { key: "suggested", header: "Suggested action", getValue: (e: FinanceException) => e.suggestedAction },
            { key: "owner", header: "Owner", getValue: (e: FinanceException) => name(e.ownerId) },
            {
              key: "status",
              header: "Status",
              getValue: (e: FinanceException) => FINANCE_EXCEPTION_STATUS_LABEL[e.status] ?? e.status,
            },
            { key: "resolution", header: "Resolution", getValue: (e: FinanceException) => e.resolutionNote },
            { key: "resolved_by", header: "Resolved by", getValue: (e: FinanceException) => name(e.resolvedBy) },
            { key: "resolved_at", header: "Resolved", type: "datetime", getValue: (e: FinanceException) => e.resolvedAt },
            { key: "created", header: "Created", type: "datetime", getValue: (e: FinanceException) => e.createdAt },
            { key: "updated", header: "Updated", type: "datetime", getValue: (e: FinanceException) => e.updatedAt },
          ],
        },
      ],
    };
  },
};

type ReconFilters = { period: string };

/**
 * /finance/reconciliation -- the GSTR-2B / IMS exceptions for the page's `?period=YYYY-MM`
 * (this month when absent), every status, as `listReconciliationExceptions` returns them.
 * The page reads with no permission check (`gst.manage_reconciliation` only enables
 * syncing and resolving).
 */
export const financeReconciliationExceptionsExport: ExportAdapter<ReconFilters> = {
  id: "finance.reconciliation-exceptions",
  module: FINANCE_LICENCE,
  permissions: FINANCE_READ_PERMISSIONS,
  parseFilters: (params) => ({ period: calendarPeriodParam(params.get("period")) }),
  describeFilters: (f) => ({ Period: f.period }),
  async load(context, filters) {
    const [exceptions, name] = await Promise.all([
      listReconciliationExceptions(context.businessId, filters.period),
      memberNames(context.businessId),
    ]);
    return {
      module: FINANCE_FILE_MODULE,
      resource: "reconciliation-exceptions",
      title: `GST reconciliation exceptions ${filters.period}`,
      metadata: { "Return period": filters.period },
      sheets: [
        {
          sheetName: "Reconciliation exceptions",
          rows: exceptions,
          columns: [
            { key: "exception", header: "Exception", getValue: (e: ReconciliationException) => e.summary },
            {
              key: "category",
              header: "Category",
              getValue: (e: ReconciliationException) => RECONCILIATION_EXCEPTION_TYPE_LABEL[e.exceptionType] ?? e.exceptionType,
            },
            { key: "reference", header: "Reference", getValue: (e: ReconciliationException) => e.referenceKey },
            { key: "period", header: "Return period", getValue: (e: ReconciliationException) => e.returnPeriod },
            {
              key: "status",
              header: "Status",
              getValue: (e: ReconciliationException) => RECONCILIATION_EXCEPTION_STATUS_LABEL[e.status] ?? e.status,
            },
            { key: "resolution", header: "Resolution", getValue: (e: ReconciliationException) => e.resolutionNote },
            { key: "resolved_by", header: "Resolved by", getValue: (e: ReconciliationException) => name(e.resolvedBy) },
            { key: "resolved_at", header: "Resolved", type: "datetime", getValue: (e: ReconciliationException) => e.resolvedAt },
            { key: "created", header: "Created", type: "datetime", getValue: (e: ReconciliationException) => e.createdAt },
            { key: "updated", header: "Updated", type: "datetime", getValue: (e: ReconciliationException) => e.updatedAt },
          ],
        },
      ],
    };
  },
};
