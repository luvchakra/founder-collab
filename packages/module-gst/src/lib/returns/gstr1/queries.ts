import { resolveOutwardDocuments } from "../shared/queries";
import { getEffectiveGstr1B2cLargeThreshold } from "./threshold";
import { aggregateGstr1 } from "./aggregate";
import type { Gstr1Return } from "./types";

/**
 * COMPLY-P0-07.1 (GSTR-1 Preparation): "prepare" here means COMPUTE, on demand, from the
 * business's own existing `core.documents`/`core.document_lines` -- there is no new
 * persisted table (checked against the entity-ownership map and this backlog's own §5
 * first: `ReturnDefinition`/`ReturnPeriod`/`ReturnSubmission` are listed as Compliance's
 * own future concepts, but nothing about "preparing" a return implies persisting one yet).
 * This mirrors the exact "lib first" shape every prior epic in this backlog has followed
 * (e.g. COMPLY-P0-05.1's own `getEinvoiceEligibility` computes live from existing data with
 * no table of its own; COMPLY-P0-05.4's `gst.einvoices` only appears once there's an actual
 * SUBMISSION result to persist). A `ReturnPeriod`/`ReturnSubmission` table becomes the right
 * thing to add once COMPLY-P0-07.5 (Return Review Workflow) needs somewhere to persist a
 * period's own Draft/Validate/Review/Approve/File STATE -- this story has no such state to
 * persist; it only assembles the numbers a reviewer would see in "Draft."
 *
 * The document read/place-of-supply resolution itself lives in `../shared/queries.ts`'s
 * own `resolveOutwardDocuments` (extracted during COMPLY-P0-07.2 once GSTR-3B needed the
 * identical read) -- this file's own job is purely the GSTR-1-specific threshold lookup
 * plus classification/aggregation.
 *
 * **Documented simplification**: the B2C Large threshold is resolved ONCE, as of the
 * period's own END date, and applied to every document in the period -- not re-resolved
 * per document's own `doc_date`. A return period is realistically a calendar month, and
 * this rule's own one real version change to date (01-Aug-2024) falls exactly on a month
 * boundary, so this never actually produces a wrong answer for a real monthly period; a
 * period whose date range genuinely straddled a rule version change would need
 * per-document resolution this function does not do. Flagged here rather than silently
 * assumed correct in general.
 */

const NOT_MODELED_TABLES = [
  "Table 4B/4C (reverse charge / e-commerce-operator-collected B2B supplies) -- no such flag exists on core.documents",
  "Table 6A/6B/6C (exports with/without payment, SEZ, deemed exports) -- exports are detected and excluded, not placed in a Table 6 row; SEZ has no flag on any party",
  "Table 8 (Nil-rated / exempted / non-GST outward supplies) -- no per-line tax treatment is recorded on core.document_lines today",
  "Table 9A / 10 (amendments to a prior period's own B2B/B2CL/exports/B2C Others)  -- no document-amendment/revision history exists",
  "Table 11 (advances received/adjusted) -- no advance-receipt concept exists in core",
  "Table 13 (documents issued, incl. cancelled-document counts) -- core.documents.status has no fixed cross-module vocabulary",
  "Table 14/15 (e-commerce operator supplies) -- no e-commerce-operator concept exists in core",
];

/**
 * The full GSTR-1 draft for one business and period -- see this file's own docstring and
 * `types.ts`'s own docstring for exactly which tables are populated and which are
 * deliberately not. `periodStart`/`periodEnd` are inclusive, `YYYY-MM-DD` dates (the same
 * convention `lib/filing/queries.ts`'s own `getPurchaseRegister`/`getSalesRegister`
 * already use).
 */
export async function getGstr1Return(businessId: string, periodStart: string, periodEnd: string): Promise<Gstr1Return> {
  const [sourceDocuments, thresholdResult] = await Promise.all([
    resolveOutwardDocuments(businessId, periodStart, periodEnd),
    getEffectiveGstr1B2cLargeThreshold(periodEnd),
  ]);

  const aggregation = aggregateGstr1(sourceDocuments, thresholdResult?.thresholdInr ?? null);

  return {
    businessId,
    periodStart,
    periodEnd,
    b2cLargeThreshold: thresholdResult ? { thresholdInr: thresholdResult.thresholdInr, source: thresholdResult.rule.source } : null,
    b2b: aggregation.b2b,
    b2cLarge: aggregation.b2cLarge,
    b2cOthers: aggregation.b2cOthers,
    creditDebitNotes: aggregation.creditDebitNotes,
    hsnSummary: aggregation.hsnSummary,
    totals: aggregation.totals,
    excluded: aggregation.excluded,
    notModeled: NOT_MODELED_TABLES,
  };
}
