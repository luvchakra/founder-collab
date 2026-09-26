import { createClient } from "../../db/server";
import { createAdminClient } from "../../db/admin";
import { createAdminClient as createCoreAdminClient } from "@cofounderai/core/db/admin";
import { nextNumber } from "@cofounderai/core/numbering/mutations";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { isPeriodPostable } from "./balance";
import { planPosting, type PostingPlan } from "./posting-rules";
import { reverseLines, validateManualEntry, type JournalLineDraft } from "./journal";
import type { FinanceEvent } from "./events";
import type { AccountRoleKey } from "./types";

/** The scope `core.next_number` mints journal numbers under, and the prefix they carry.
 * Fiscal-year aware and gap-free — see `core.next_number()`. */
const ENTRY_NUMBER_SCOPE = "journal_entry";
const ENTRY_NUMBER_PREFIX = "JE";

type Supabase = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

/** A posting refused because its period is locked, filed or closed. Its own class so the
 * automatic path can tell it apart from a genuine failure (FIN-11, below). */
export class PeriodClosedError extends Error {}

/**
 * The period a posting date falls in, and whether it will take the posting.
 *
 * Checked here so the refusal can name the month and say what to do instead; the
 * database refuses it too (a trigger on `gst.journal_entries`), which is what makes the
 * rule true regardless of who is writing.
 */
async function resolvePeriod(
  supabase: Supabase,
  businessId: string,
  postingDate: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("accounting_periods")
    .select("id, status")
    .eq("business_id", businessId)
    .lte("start_date", postingDate)
    .gte("end_date", postingDate)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null; // No period covers this date yet: nothing to lock against.

  const period = data as { id: string; status: string };
  if (!isPeriodPostable(period.status)) {
    throw new PeriodClosedError(
      `The accounting period covering ${postingDate} is ${period.status} and won't take new entries. Post the correction in an open period instead.`,
    );
  }
  return period.id;
}

export interface JournalEntryInput {
  postingDate: string;
  documentDate?: string | null;
  memo?: string | null;
  lines: JournalLineDraft[];
  /** A draft may be unbalanced and edited later; posting is the point of no return. */
  status?: "draft" | "posted";
  /** FIN-8: an entry Finance itself posts on a person's say-so (applying a bank rule)
   * records where it came from and which rule, so it explains itself like any automatic
   * entry. Absent for a hand-typed entry. */
  source?: { entityType: string; entityId: string; ruleKey: string; ruleVersion: number };
  /** Keys the entry so the same act cannot post twice (a double-click, a retried
   * request) — enforced by the unique index on (business_id, idempotency_key). */
  idempotencyKey?: string;
}

/**
 * Writes one journal entry and its lines.
 *
 * Entry and lines go in as two statements rather than one RPC, which is safe because the
 * balance invariant is a DEFERRABLE constraint trigger: it is checked at commit, not per
 * row, so the entry can exist momentarily without its lines without being rejected for
 * it.
 */
async function insertEntry(
  supabase: Supabase,
  businessId: string,
  entry: Record<string, unknown>,
  lines: JournalLineDraft[],
): Promise<string> {
  const { data, error } = await supabase
    .from("journal_entries")
    .insert({ business_id: businessId, ...entry })
    .select("id")
    .single();
  if (error) throw error;
  const entryId = (data as { id: string }).id;

  const { error: lineError } = await supabase.from("journal_lines").insert(
    lines.map((line, i) => ({
      business_id: businessId,
      entry_id: entryId,
      line_number: i + 1,
      account_id: line.accountId,
      debit: line.debit,
      credit: line.credit,
      memo: line.memo ?? null,
      party_id: line.partyId ?? null,
      item_id: line.itemId ?? null,
      location: line.location ?? null,
      project_ref: line.projectRef ?? null,
      tax_code: line.taxCode ?? null,
      gst_amount: line.gstAmount ?? null,
    })),
  );
  if (lineError) throw lineError;
  return entryId;
}

/** A manual journal entry — the adjustment, accrual or correction no module produces on
 * its own. */
export async function createJournalEntry(
  businessId: string,
  input: JournalEntryInput,
): Promise<string> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.journal.create");

  const status = input.status ?? "draft";
  const problems = validateManualEntry(input.lines, input.postingDate, status);
  if (problems.length > 0) throw new Error(problems.join(" "));

  const supabase = await createClient();
  const periodId = await resolvePeriod(supabase, businessId, input.postingDate);
  const entryNumber = await nextNumber(businessId, ENTRY_NUMBER_SCOPE, ENTRY_NUMBER_PREFIX);

  return insertEntry(
    supabase,
    businessId,
    {
      entry_number: entryNumber,
      posting_date: input.postingDate,
      document_date: input.documentDate ?? null,
      period_id: periodId,
      memo: input.memo ?? null,
      status,
      source_module: "finance",
      source_entity_type: input.source?.entityType ?? null,
      source_entity_id: input.source?.entityId ?? null,
      posting_rule_key: input.source?.ruleKey ?? null,
      posting_rule_version: input.source?.ruleVersion ?? null,
      idempotency_key: input.idempotencyKey ?? null,
      posted_at: status === "posted" ? new Date().toISOString() : null,
    },
    input.lines,
  );
}

/** Posts a draft. The database re-checks the balance at commit, so a draft that was left
 * unbalanced fails here rather than entering the ledger. */
export async function postJournalEntry(businessId: string, entryId: string): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.journal.create");

  const supabase = await createClient();
  const { data, error: readError } = await supabase
    .from("journal_entries")
    .select("status, posting_date")
    .eq("business_id", businessId)
    .eq("id", entryId)
    .single();
  if (readError) throw readError;

  const entry = data as { status: string; posting_date: string };
  if (entry.status !== "draft") {
    throw new Error(`This entry is already ${entry.status} — only a draft can be posted.`);
  }
  await resolvePeriod(supabase, businessId, entry.posting_date);

  const { error } = await supabase
    .from("journal_entries")
    .update({ status: "posted", posted_at: new Date().toISOString() })
    .eq("business_id", businessId)
    .eq("id", entryId);
  if (error) throw error;
}

/**
 * Reverses a posted entry.
 *
 * A new entry with every side swapped, rather than an edit or a delete: both halves stay
 * in the ledger and both show in the account's history. The reversal carries its own
 * posting date — usually today, not the original's, since the original's period may well
 * be closed, and that is exactly the situation a reversal exists for.
 */
export async function reverseJournalEntry(
  businessId: string,
  entryId: string,
  postingDate?: string,
): Promise<string> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.journal.create");

  const supabase = await createClient();
  const [{ data: entryRow, error: entryError }, { data: lineRows, error: lineError }] = await Promise.all([
    supabase
      .from("journal_entries")
      .select("status, memo, entry_number, source_module, source_entity_type, source_entity_id")
      .eq("business_id", businessId)
      .eq("id", entryId)
      .single(),
    supabase
      .from("journal_lines")
      .select("account_id, debit, credit, memo, party_id, item_id, location, project_ref, tax_code, gst_amount")
      .eq("business_id", businessId)
      .eq("entry_id", entryId)
      .order("line_number", { ascending: true }),
  ]);
  if (entryError) throw entryError;
  if (lineError) throw lineError;

  const entry = entryRow as {
    status: string;
    memo: string | null;
    entry_number: string | null;
    source_module: string | null;
    source_entity_type: string | null;
    source_entity_id: string | null;
  };
  if (entry.status !== "posted") {
    throw new Error(
      entry.status === "reversed"
        ? "This entry has already been reversed."
        : "Only a posted entry can be reversed — edit or delete the draft instead.",
    );
  }

  const date = postingDate ?? new Date().toISOString().slice(0, 10);
  const periodId = await resolvePeriod(supabase, businessId, date);
  const entryNumber = await nextNumber(businessId, ENTRY_NUMBER_SCOPE, ENTRY_NUMBER_PREFIX);

  const lines = reverseLines(
    (lineRows ?? []).map((line: Record<string, unknown>) => ({
      accountId: line.account_id as string,
      debit: Number(line.debit ?? 0),
      credit: Number(line.credit ?? 0),
      memo: (line.memo as string | null) ?? null,
      partyId: (line.party_id as string | null) ?? null,
      itemId: (line.item_id as string | null) ?? null,
      // FIN-9: a reversal carries the original's dimensions, so reporting by location or
      // project nets the pair to nothing instead of leaving the reversal unattributed.
      location: (line.location as string | null) ?? null,
      projectRef: (line.project_ref as string | null) ?? null,
      taxCode: (line.tax_code as string | null) ?? null,
      gstAmount: line.gst_amount === null || line.gst_amount === undefined ? null : Number(line.gst_amount),
    })),
  );

  const reversalId = await insertEntry(
    supabase,
    businessId,
    {
      entry_number: entryNumber,
      posting_date: date,
      period_id: periodId,
      memo: `Reversal of ${entry.entry_number ?? "entry"}${entry.memo ? ` — ${entry.memo}` : ""}`,
      status: "posted",
      reversal_of_entry_id: entryId,
      // The reversal inherits the original's source so both halves show up together when
      // someone asks what this invoice did to the ledger.
      source_module: entry.source_module,
      source_entity_type: entry.source_entity_type,
      source_entity_id: entry.source_entity_id,
      posted_at: new Date().toISOString(),
    },
    lines,
  );

  const { error } = await supabase
    .from("journal_entries")
    .update({ status: "reversed" })
    .eq("business_id", businessId)
    .eq("id", entryId);
  if (error) throw error;

  return reversalId;
}

/** Account ids for the roles a posting plan asks for, from this business's own mappings. */
async function resolveRoles(
  supabase: Supabase,
  businessId: string,
  roles: AccountRoleKey[],
): Promise<Map<AccountRoleKey, string>> {
  const { data, error } = await supabase
    .from("account_mappings")
    .select("role_key, account_id")
    .eq("business_id", businessId)
    .in("role_key", roles);
  if (error) throw error;
  return new Map(
    (data ?? []).map((row: { role_key: AccountRoleKey; account_id: string }) => [row.role_key, row.account_id]),
  );
}

export type PostFinanceEventResult =
  | { posted: true; entryId: string; duplicate: boolean }
  | { posted: false; reason: string };

/**
 * Turns one financial event from an operational module into a posted journal entry.
 *
 * The bridge between the deterministic rules engine (`planPosting`) and the ledger. Three
 * outcomes, all normal:
 *
 *  - no accounting consequence (most of what the modules publish) — nothing is written;
 *  - already posted — the unique index on (business_id, idempotency_key) catches the
 *    redelivery and this reports the entry that already exists, rather than a second one.
 *    That is the whole of duplicate protection, and it is the database's, not a
 *    check-then-insert race here;
 *  - posted — a new balanced entry, stamped with the rule and version that produced it.
 *
 * A role the business hasn't mapped is a refusal with a readable reason rather than an
 * exception: the fix is to finish setting up the chart of accounts, not to retry.
 */
export async function postFinanceEvent(
  businessId: string,
  event: FinanceEvent,
  plan?: PostingPlan,
): Promise<PostFinanceEventResult> {
  const result = plan ?? planPosting(event);
  if (!result.posted) return { posted: false, reason: result.reason };

  // Service-role throughout: this runs from the domain-event drain, where there is no
  // signed-in user for RLS to resolve. Every statement below is scoped to the
  // `businessId` on the event row itself, which the drain read from `core.domain_events`
  // — never a client-supplied value.
  const supabase = createAdminClient();
  const core = createCoreAdminClient({ schema: "core" });

  // The drain's own gate parks an event for a business with no licence, but would let
  // one through during ADR-9's 30-day read-only grace period, where a new posting is
  // exactly the write that must not happen. `has_module_write` is the check that knows
  // the difference.
  const { data: licensed, error: licenseError } = await core.rpc("has_module_write", {
    p_business_id: businessId,
    p_key: "gst",
  });
  if (licenseError) throw licenseError;
  if (!licensed) {
    return { posted: false, reason: "Finance isn't licensed for this business (or is in its read-only grace period)." };
  }

  const { data: existing, error: existingError } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("business_id", businessId)
    .eq("idempotency_key", result.idempotencyKey)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { posted: true, entryId: (existing as { id: string }).id, duplicate: true };

  const roles = [...new Set(result.lines.map((line) => line.role))];
  const accountByRole = await resolveRoles(supabase, businessId, roles);
  const unmapped = roles.filter((role) => !accountByRole.has(role));
  if (unmapped.length > 0) {
    return {
      posted: false,
      reason: `No account is set up for ${unmapped.join(", ")}. Finish setting up the chart of accounts and this will post.`,
    };
  }

  const postingDate = event.occurredAt.slice(0, 10);
  // FIN-11 (historical backfill): a document dated in a locked or filed period is a
  // refusal like any other — "Posting refusals are values, not exceptions". Thrown, it
  // aborted the whole backfill at the first old document and would have had the drain
  // retrying a posting no retry can fix; returned, it lands in the exceptions queue with
  // its reason, and every other document still posts.
  let periodId: string | null;
  try {
    periodId = await resolvePeriod(supabase, businessId, postingDate);
  } catch (error) {
    if (error instanceof PeriodClosedError) return { posted: false, reason: error.message };
    throw error;
  }

  // `core.next_number()` checks membership via auth.uid(), which is null here; its
  // service-role twin shares the same counter, so a number minted from the drain
  // continues the identical sequence a number minted from the UI would have.
  const { data: entryNumber, error: numberError } = await core.rpc("next_number_for_api", {
    p_business_id: businessId,
    p_scope: ENTRY_NUMBER_SCOPE,
    p_prefix: ENTRY_NUMBER_PREFIX,
  });
  if (numberError) throw numberError;

  const entryId = await insertEntry(
    supabase,
    businessId,
    {
      entry_number: entryNumber,
      posting_date: postingDate,
      document_date: postingDate,
      period_id: periodId,
      memo: result.explanation,
      status: "posted",
      source_module: event.sourceModule,
      source_entity_type: event.sourceEntityType,
      source_entity_id: event.sourceEntityId,
      source_document_id: event.sourceDocumentId ?? null,
      source_event_id: event.sourceEventId ?? null,
      idempotency_key: result.idempotencyKey,
      posting_rule_key: result.ruleKey,
      posting_rule_version: result.ruleVersion,
      posted_at: new Date().toISOString(),
    },
    result.lines.map((line) => ({
      // An account the person chose by hand wins over the role's default, but only for
      // the line actually carrying the value — tax and the payable still resolve by role.
      accountId: (line.isValueLine && event.valueAccountId) || accountByRole.get(line.role)!,
      debit: line.debit,
      credit: line.credit,
      memo: line.memo ?? null,
      partyId: event.partyId ?? null,
      taxCode: line.taxCode ?? null,
      gstAmount: line.gstAmount ?? null,
    })),
  );

  return { posted: true, entryId, duplicate: false };
}
