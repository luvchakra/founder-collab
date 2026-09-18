import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { parseBankStatementCsv, type ParseProblem } from "./bank-statement-import";
import { reconciliationPosition } from "./bank-matching";

export interface BankAccountInput {
  name: string;
  bankName?: string | null;
  accountNumberLast4?: string | null;
  ifsc?: string | null;
  accountType?: string;
  ledgerAccountId?: string | null;
  openingBalance?: number;
  openingBalanceDate?: string | null;
}

export async function createBankAccount(businessId: string, input: BankAccountInput): Promise<string> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.banking.manage");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_accounts")
    .insert({
      business_id: businessId,
      name: input.name.trim(),
      bank_name: input.bankName?.trim() || null,
      account_number_last4: input.accountNumberLast4?.trim() || null,
      ifsc: input.ifsc?.trim().toUpperCase() || null,
      account_type: input.accountType ?? "current",
      ledger_account_id: input.ledgerAccountId || null,
      opening_balance: input.openingBalance ?? 0,
      opening_balance_date: input.openingBalanceDate || null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export interface ImportResult {
  imported: number;
  /** Rows the file contained that were already here, from an overlapping statement. */
  duplicates: number;
  problems: ParseProblem[];
}

/**
 * Imports a bank statement CSV.
 *
 * Duplicate protection is the database's: each row carries a fingerprint derived from its
 * own content, and a unique index per bank account rejects the second copy. That is what
 * makes re-importing an overlapping statement safe, which people do constantly — they
 * download "last 90 days" every month.
 *
 * Rows are inserted one statement rather than one at a time, and the already-present ones
 * are counted rather than treated as failures: "40 imported, 22 already here" is the
 * normal, expected outcome of a monthly download, not an error report.
 */
export async function importBankStatement(
  businessId: string,
  bankAccountId: string,
  csv: string,
): Promise<ImportResult> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.banking.manage");

  const parsed = parseBankStatementCsv(csv);
  if (parsed.rows.length === 0) {
    return { imported: 0, duplicates: 0, problems: parsed.problems };
  }

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("bank_transactions")
    .select("import_fingerprint")
    .eq("business_id", businessId)
    .eq("bank_account_id", bankAccountId)
    .in("import_fingerprint", parsed.rows.map((r) => r.importFingerprint));
  if (existingError) throw existingError;

  const already = new Set(
    (existing ?? []).map((row: { import_fingerprint: string | null }) => row.import_fingerprint),
  );
  const fresh = parsed.rows.filter((row) => !already.has(row.importFingerprint));

  if (fresh.length > 0) {
    const { error } = await supabase.from("bank_transactions").insert(
      fresh.map((row) => ({
        business_id: businessId,
        bank_account_id: bankAccountId,
        txn_date: row.txnDate,
        description: row.description,
        reference: row.reference,
        amount: row.amount,
        balance_after: row.balanceAfter,
        source: "import",
        import_fingerprint: row.importFingerprint,
      })),
    );
    if (error) throw error;
  }

  return {
    imported: fresh.length,
    duplicates: parsed.rows.length - fresh.length,
    problems: parsed.problems,
  };
}

/**
 * Ties a statement line to the ledger entry that explains it.
 *
 * Deliberately only ever driven by a person: `suggestMatches` ranks candidates and this
 * records the decision. A wrong automatic match hides a real missing entry behind a
 * plausible-looking one, and nobody goes looking for a transaction already ticked off.
 */
export async function matchBankTransaction(
  businessId: string,
  transactionId: string,
  entryId: string,
): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.banking.manage");

  const supabase = await createClient();
  const {
    data: { user },
  } = await (await createCoreClient({ schema: "core" })).auth.getUser();

  const { error } = await supabase
    .from("bank_transactions")
    .update({
      matched_entry_id: entryId,
      status: "matched",
      matched_at: new Date().toISOString(),
      matched_by: user?.id ?? null,
    })
    .eq("business_id", businessId)
    .eq("id", transactionId)
    // A reconciled line belongs to a period someone signed off on; re-matching it would
    // change what that sign-off meant.
    .in("status", ["unmatched", "matched", "ignored"]);
  if (error) throw error;
}

/** Undoes a match. The constraint on the table means the entry has to be cleared in the
 * same statement as the status, or the row would briefly claim to be matched to nothing. */
export async function unmatchBankTransaction(businessId: string, transactionId: string): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.banking.manage");

  const supabase = await createClient();
  const { error } = await supabase
    .from("bank_transactions")
    .update({ matched_entry_id: null, status: "unmatched", matched_at: null, matched_by: null })
    .eq("business_id", businessId)
    .eq("id", transactionId)
    .eq("status", "matched");
  if (error) throw error;
}

/**
 * Sets a line aside as not needing a ledger entry — an internal transfer between two of
 * the business's own accounts, a bank's own reversal of its own error.
 *
 * Kept distinct from matched: a reconciliation that counts ignored lines as explained is
 * lying, so `reconciliationPosition` treats only matched lines as accounted for.
 */
export async function ignoreBankTransaction(businessId: string, transactionId: string): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.banking.manage");

  const supabase = await createClient();
  const { error } = await supabase
    .from("bank_transactions")
    .update({ status: "ignored", matched_entry_id: null, matched_at: null, matched_by: null })
    .eq("business_id", businessId)
    .eq("id", transactionId)
    .eq("status", "unmatched");
  if (error) throw error;
}

export interface ReconcileInput {
  bankAccountId: string;
  statementStart: string;
  statementEnd: string;
  statementClosingBalance: number;
  notes?: string | null;
}

/**
 * Records that someone reconciled an account to a statement.
 *
 * Kept as a record rather than recomputed, because "these books were reconciled to the
 * statement on this date" is a fact about an act a person performed. The ledger balance
 * is captured as it stood at that moment for the same reason — recomputing it later would
 * quietly rewrite what was signed off.
 *
 * A difference does not block completion: a known, explained gap someone accepted is a
 * normal outcome, and refusing to record it would just push the reconciliation into a
 * spreadsheet where nobody can see it.
 */
export async function completeReconciliation(
  businessId: string,
  input: ReconcileInput,
): Promise<{ id: string; difference: number; reconciled: boolean }> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.banking.manage");

  const supabase = await createClient();
  const { data: account, error: accountError } = await supabase
    .from("bank_accounts")
    .select("opening_balance")
    .eq("business_id", businessId)
    .eq("id", input.bankAccountId)
    .single();
  if (accountError) throw accountError;

  const { data: transactions, error: txnError } = await supabase
    .from("bank_transactions")
    .select("amount, status")
    .eq("business_id", businessId)
    .eq("bank_account_id", input.bankAccountId)
    .lte("txn_date", input.statementEnd);
  if (txnError) throw txnError;

  const rows = (transactions ?? []) as { amount: number; status: string }[];
  const ledgerClosing =
    Number((account as { opening_balance: number }).opening_balance ?? 0) +
    rows
      .filter((t) => t.status === "matched" || t.status === "reconciled")
      .reduce((sum, t) => sum + Number(t.amount ?? 0), 0);

  const position = reconciliationPosition(
    input.statementClosingBalance,
    Math.round(ledgerClosing * 100) / 100,
    rows.filter((t) => t.status === "unmatched").map((t) => ({ amount: Number(t.amount ?? 0) })),
  );

  const {
    data: { user },
  } = await (await createCoreClient({ schema: "core" })).auth.getUser();

  const { data, error } = await supabase
    .from("bank_reconciliations")
    .upsert(
      {
        business_id: businessId,
        bank_account_id: input.bankAccountId,
        statement_start: input.statementStart,
        statement_end: input.statementEnd,
        statement_closing_balance: input.statementClosingBalance,
        ledger_closing_balance: position.ledgerClosing,
        difference: position.difference,
        status: "completed",
        notes: input.notes?.trim() || null,
        completed_at: new Date().toISOString(),
        completed_by: user?.id ?? null,
      },
      { onConflict: "bank_account_id,statement_start,statement_end" },
    )
    .select("id")
    .single();
  if (error) throw error;

  // Matched lines within the signed-off window become reconciled: they are now part of a
  // period someone stood behind, and stop being re-matchable.
  const { error: markError } = await supabase
    .from("bank_transactions")
    .update({ status: "reconciled" })
    .eq("business_id", businessId)
    .eq("bank_account_id", input.bankAccountId)
    .eq("status", "matched")
    .gte("txn_date", input.statementStart)
    .lte("txn_date", input.statementEnd);
  if (markError) throw markError;

  return { id: (data as { id: string }).id, difference: position.difference, reconciled: position.reconciled };
}
