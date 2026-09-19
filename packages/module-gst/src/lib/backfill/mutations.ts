import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { postIssuedDocument, postPaymentAllocation } from "../accounting/event-posting";
import { getFinanceExceptionByKey } from "../exceptions-queue/queries";
import { createClient } from "../../db/server";
import { classifyBackfillResult } from "./derive";
import { scanFinanceBackfill } from "./queries";
import type { BackfillCandidate, BackfillItemResult, BackfillRunResult } from "./types";

/**
 * FIN-2: runs the backfill -- posts every eligible candidate `scanFinanceBackfill` finds,
 * through the exact same idempotent path (`postIssuedDocument`/`postPaymentAllocation`)
 * the live `document.issued`/`payment.allocated` event drain already uses. Never a
 * separate posting path of its own: a second way to reach `gst.journal_entries` is a
 * second place for that to disagree with the first, and idempotency is already solved --
 * the unique index on `idempotency_key`/`source_entity_id` means running this twice, or
 * running it after the drain has already caught some of the same documents, converges on
 * the same ledger either way. "Must never silently duplicate history" falls out of reusing
 * that path rather than needing its own guarantee.
 *
 * Whatever can't post is routed straight into `gst.finance_exceptions` (additive-insert,
 * same natural-key dedupe FIN-1's own sync uses) rather than reported and dropped -- a
 * founder who runs this once should not need to remember to run it again to see what
 * needs attention.
 */

async function routeToExceptionsQueue(businessId: string, candidate: BackfillCandidate, reason: string): Promise<void> {
  const exceptionType = candidate.kind === "document" ? "unposted_document" : "unposted_payment";
  const existing = await getFinanceExceptionByKey(businessId, exceptionType, candidate.id);
  if (existing) return;

  const supabase = await createClient();
  const { error } = await supabase.from("finance_exceptions").insert({
    business_id: businessId,
    exception_type: exceptionType,
    reference_key: candidate.id,
    summary: `${candidate.label} could not be posted during backfill: ${reason}`,
    impact: "Left unposted, the accounts -- and any return drawn from them -- understate this history.",
    suggested_action: "Finish setting up the chart of accounts and account mappings, then run the backfill again.",
  });
  if (error) throw error;
}

export async function runFinanceBackfill(businessId: string): Promise<BackfillRunResult> {
  await requireModule(businessId, "gst");
  // A backfill posting is a journal entry entered in bulk -- same permission the recurring
  // entries drain reuses for the same reason (F10's own precedent).
  await requirePermission(businessId, "gst.journal.create");

  const scan = await scanFinanceBackfill(businessId);
  const items: BackfillItemResult[] = [];

  for (const candidate of [...scan.documents, ...scan.paymentAllocations]) {
    const result =
      candidate.kind === "document"
        ? await postIssuedDocument(businessId, candidate.id)
        : await postPaymentAllocation(businessId, candidate.id);

    const item = classifyBackfillResult(candidate, result);
    if (item.outcome === "exception") {
      await routeToExceptionsQueue(businessId, candidate, item.reason!);
    }
    items.push(item);
  }

  return {
    scannedDocuments: scan.documents.length,
    scannedPaymentAllocations: scan.paymentAllocations.length,
    posted: items.filter((i) => i.outcome === "posted").length,
    alreadyPosted: items.filter((i) => i.outcome === "already_posted").length,
    noConsequence: items.filter((i) => i.outcome === "no_consequence").length,
    exceptions: items.filter((i) => i.outcome === "exception").length,
    items,
  };
}
