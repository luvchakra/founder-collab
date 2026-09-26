// EXP-FIN-17 (Backfill) -- Finance backfill export (/finance/backfill).
import type { ExportAdapter } from "@cofounderai/core/exports/server";
import { scanFinanceBackfill } from "../lib/backfill/queries";
import type { BackfillCandidate } from "../lib/backfill/types";
import { BACKFILL_KIND_LABEL } from "./labels";
import { FINANCE_FILE_MODULE, FINANCE_LICENCE, FINANCE_READ_PERMISSIONS } from "./shared";

/**
 * What the backfill page knows: the current scan (`scanFinanceBackfill`) -- every
 * document and payment allocation with an accounting consequence that has not reached
 * the ledger, i.e. exactly what the next run would examine. Past runs are not persisted
 * anywhere (a run's result is returned to the page once and then gone), so there is no
 * run history -- runs, records changed, run status, errors -- to export; a run that fails
 * to post an item files it in the exceptions queue, which has its own export
 * (`finance.exceptions`). The page reads with no permission check (`gst.journal.create`
 * only enables running it).
 */
export const financeBackfillExport: ExportAdapter<Record<string, never>> = {
  id: "finance.backfill",
  module: FINANCE_LICENCE,
  permissions: FINANCE_READ_PERMISSIONS,
  parseFilters: () => ({}),
  async load(context) {
    const scan = await scanFinanceBackfill(context.businessId);
    const rows: BackfillCandidate[] = [...scan.documents, ...scan.paymentAllocations];
    return {
      module: FINANCE_FILE_MODULE,
      resource: "backfill",
      title: "Finance backfill scan",
      metadata: {
        "Documents to post": String(scan.documents.length),
        "Payment allocations to post": String(scan.paymentAllocations.length),
      },
      sheets: [
        {
          sheetName: "Pending backfill",
          rows,
          columns: [
            { key: "kind", header: "Kind", getValue: (c: BackfillCandidate) => BACKFILL_KIND_LABEL[c.kind] ?? c.kind },
            { key: "item", header: "Item", getValue: (c: BackfillCandidate) => c.label },
            { key: "document", header: "Document id", getValue: (c: BackfillCandidate) => c.documentId },
            { key: "status", header: "Status", getValue: () => "Not yet posted" },
          ],
        },
      ],
    };
  },
};
