import { createClient } from "../../db/server";
import { createAdminClient } from "../../db/admin";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { isPeriodPostable } from "./balance";
import {
  dueOccurrences,
  recurringIdempotencyKey,
  templateProblems,
  type RecurrenceFrequency,
  type RecurringTemplateLine,
} from "./recurring";

export interface RecurringEntryInput {
  name: string;
  memo?: string | null;
  frequency: RecurrenceFrequency;
  anchorDate: string;
  endOn?: string | null;
  lines: RecurringTemplateLine[];
}

export async function createRecurringEntry(businessId: string, input: RecurringEntryInput): Promise<string> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.journal.create");

  const problems = templateProblems(input.lines);
  if (problems.length > 0) throw new Error(problems.join(" "));

  const supabase = await createClient();
  const {
    data: { user },
  } = await (await createCoreClient({ schema: "core" })).auth.getUser();

  const { data, error } = await supabase
    .from("recurring_entries")
    .insert({
      business_id: businessId,
      name: input.name.trim(),
      memo: input.memo?.trim() || null,
      frequency: input.frequency,
      anchor_date: input.anchorDate,
      end_on: input.endOn || null,
      template_lines: input.lines,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

/** Pausing rather than deleting is the usual intent: the entries it already posted are
 * ledger history and stay regardless, but keeping the template means resuming doesn't
 * mean rebuilding it from memory. */
export async function setRecurringEntryActive(
  businessId: string,
  id: string,
  isActive: boolean,
): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.journal.create");

  const supabase = await createClient();
  const { error } = await supabase
    .from("recurring_entries")
    .update({ is_active: isActive })
    .eq("business_id", businessId)
    .eq("id", id);
  if (error) throw error;
}

export interface RecurringRunResult {
  posted: number;
  skipped: number;
  /** Occurrences that could not post, and why — a locked period, most often. */
  problems: { occurrence: string; reason: string }[];
}

/**
 * Posts everything a template owes.
 *
 * Runs from the drain, so service-role throughout: there is no session for RLS to
 * resolve, and the `businessId` comes from the row being processed, never from a caller.
 *
 * Idempotent per occurrence, not per run: the key is derived from the template and the
 * occurrence date, so a drain that runs twice — or catches up a backlog it already partly
 * posted — collides on the entry that exists instead of posting a second one.
 *
 * A locked period is skipped, not failed. A recurring entry that reaches a closed month
 * should not stop every later month from posting, and it must never be the reason a
 * filed period changes.
 */
export async function runRecurringEntry(
  businessId: string,
  id: string,
  asOf = new Date().toISOString().slice(0, 10),
): Promise<RecurringRunResult> {
  const gst = createAdminClient();
  const core = createCoreAdminClient({ schema: "core" });

  const { data: template, error } = await gst
    .from("recurring_entries")
    .select("id, name, memo, frequency, anchor_date, end_on, last_run_on, is_active, template_lines")
    .eq("business_id", businessId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!template) return { posted: 0, skipped: 0, problems: [] };

  const row = template as {
    id: string;
    name: string;
    memo: string | null;
    frequency: RecurrenceFrequency;
    anchor_date: string;
    end_on: string | null;
    last_run_on: string | null;
    is_active: boolean;
    template_lines: RecurringTemplateLine[];
  };
  if (!row.is_active) return { posted: 0, skipped: 0, problems: [] };

  const occurrences = dueOccurrences(row.anchor_date, row.frequency, asOf, {
    lastRunOn: row.last_run_on,
    endOn: row.end_on,
  });

  const result: RecurringRunResult = { posted: 0, skipped: 0, problems: [] };
  let highWaterMark = row.last_run_on;

  for (const occurrence of occurrences) {
    const idempotencyKey = recurringIdempotencyKey(row.id, occurrence);

    const { data: existing, error: existingError } = await gst
      .from("journal_entries")
      .select("id")
      .eq("business_id", businessId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      result.skipped += 1;
      highWaterMark = occurrence;
      continue;
    }

    const { data: period, error: periodError } = await gst
      .from("accounting_periods")
      .select("id, status")
      .eq("business_id", businessId)
      .lte("start_date", occurrence)
      .gte("end_date", occurrence)
      .maybeSingle();
    if (periodError) throw periodError;

    const periodRow = period as { id: string; status: string } | null;
    if (periodRow && !isPeriodPostable(periodRow.status)) {
      result.problems.push({
        occurrence,
        reason: `The period covering ${occurrence} is ${periodRow.status} and won't take new entries.`,
      });
      // Deliberately not advancing the high-water mark: the occurrence genuinely did not
      // post, and pretending otherwise would lose it silently forever.
      continue;
    }

    const { data: number, error: numberError } = await core.rpc("next_number_for_api", {
      p_business_id: businessId,
      p_scope: "journal_entry",
      p_prefix: "JE",
    });
    if (numberError) throw numberError;

    const { data: entry, error: entryError } = await gst
      .from("journal_entries")
      .insert({
        business_id: businessId,
        entry_number: number,
        posting_date: occurrence,
        period_id: periodRow?.id ?? null,
        memo: row.memo ?? row.name,
        status: "posted",
        source_module: "finance",
        source_entity_type: "recurring_entry",
        source_entity_id: row.id,
        idempotency_key: idempotencyKey,
        posting_rule_key: "recurring",
        posting_rule_version: 1,
        posted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (entryError) throw entryError;

    const entryId = (entry as { id: string }).id;
    const { error: lineError } = await gst.from("journal_lines").insert(
      row.template_lines.map((line, i) => ({
        business_id: businessId,
        entry_id: entryId,
        line_number: i + 1,
        account_id: line.accountId,
        debit: line.debit,
        credit: line.credit,
        memo: line.memo ?? null,
      })),
    );
    if (lineError) throw lineError;

    result.posted += 1;
    highWaterMark = occurrence;
  }

  if (highWaterMark && highWaterMark !== row.last_run_on) {
    const { error: markError } = await gst
      .from("recurring_entries")
      .update({ last_run_on: highWaterMark })
      .eq("business_id", businessId)
      .eq("id", row.id);
    if (markError) throw markError;
  }

  return result;
}

/**
 * Posts every business's due recurring entries. The drain's entry point.
 *
 * One template failing never stops the others: a locked period in one business's books is
 * that business's problem, and letting it block every other business's rent posting would
 * turn a small local issue into a platform-wide one.
 */
export async function runDueRecurringEntries(
  asOf = new Date().toISOString().slice(0, 10),
): Promise<{ businesses: number; posted: number; failed: number }> {
  const gst = createAdminClient();
  const { data, error } = await gst
    .from("recurring_entries")
    .select("id, business_id")
    .eq("is_active", true)
    .lte("anchor_date", asOf);
  if (error) throw error;

  const rows = (data ?? []) as { id: string; business_id: string }[];
  let posted = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const result = await runRecurringEntry(row.business_id, row.id, asOf);
      posted += result.posted;
    } catch {
      failed += 1;
    }
  }

  return { businesses: new Set(rows.map((r) => r.business_id)).size, posted, failed };
}
