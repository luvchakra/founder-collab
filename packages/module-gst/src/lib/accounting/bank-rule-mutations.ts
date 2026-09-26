import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { bankRuleProblems, categorisationLines, findMatchingRule, type BankRuleInput } from "./bank-rules";
import { listBankRules } from "./bank-rule-queries";
import { createJournalEntry } from "./journal-mutations";

/** FIN-8 rule version stamped on the entries a rule posts. Bumped if what applying a rule
 * posts ever changes meaning, so old entries keep saying which reading produced them. */
const BANK_RULE_VERSION = 1;

export interface BankRuleWrite extends BankRuleInput {
  partyId: string | null;
  isActive?: boolean;
}

function row(input: BankRuleWrite) {
  return {
    name: input.name.trim(),
    match_text: input.matchText.trim(),
    direction: input.direction,
    min_amount: input.minAmount,
    max_amount: input.maxAmount,
    account_id: input.accountId,
    party_id: input.partyId || null,
    priority: input.priority,
    ...(input.isActive === undefined ? {} : { is_active: input.isActive }),
  };
}

async function guard(businessId: string): Promise<void> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.bank_rules.manage");
}

export async function createBankRule(businessId: string, input: BankRuleWrite): Promise<string> {
  await guard(businessId);
  const problems = bankRuleProblems(input);
  if (problems.length > 0) throw new Error(problems.join(" "));

  const supabase = await createClient();
  const {
    data: { user },
  } = await (await createCoreClient({ schema: "core" })).auth.getUser();
  const { data, error } = await supabase
    .from("bank_rules")
    .insert({ business_id: businessId, ...row(input), created_by: user?.id ?? null })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateBankRule(businessId: string, ruleId: string, input: BankRuleWrite): Promise<void> {
  await guard(businessId);
  const problems = bankRuleProblems(input);
  if (problems.length > 0) throw new Error(problems.join(" "));

  const supabase = await createClient();
  const { error } = await supabase.from("bank_rules").update(row(input)).eq("business_id", businessId).eq("id", ruleId);
  if (error) throw error;
}

export async function setBankRuleActive(businessId: string, ruleId: string, isActive: boolean): Promise<void> {
  await guard(businessId);
  const supabase = await createClient();
  const { error } = await supabase.from("bank_rules").update({ is_active: isActive }).eq("business_id", businessId).eq("id", ruleId);
  if (error) throw error;
}

/** Lines a rule already categorised keep their entry and their match; only their
 * `rule_id` is cleared (the foreign key's `on delete set null`). */
export async function deleteBankRule(businessId: string, ruleId: string): Promise<void> {
  await guard(businessId);
  const supabase = await createClient();
  const { error } = await supabase.from("bank_rules").delete().eq("business_id", businessId).eq("id", ruleId);
  if (error) throw error;
}

/**
 * Applies the rule that fits an unmatched statement line: posts the entry the rule
 * describes, dated the day the bank reported the line, and matches the line to it.
 *
 * The rule is re-derived here from the line's own stored description and amount rather
 * than taken from the request, so what gets posted is what the rules say, not what a
 * browser sent. The entry is keyed on the line (`bank_txn:<id>`), so a double-click or a
 * retried request cannot post it twice — the unique index refuses the second.
 *
 * Needs both `gst.banking.manage` (it matches a line) and `gst.journal.create` (it posts
 * an entry — enforced inside `createJournalEntry`).
 */
export async function categoriseBankTransaction(businessId: string, transactionId: string): Promise<{ entryId: string; ruleName: string }> {
  await requireModule(businessId, "gst");
  await requirePermission(businessId, "gst.banking.manage");

  const supabase = await createClient();
  const { data: txn, error: txnError } = await supabase
    .from("bank_transactions")
    .select("id, bank_account_id, txn_date, description, amount, status, bank_accounts(ledger_account_id)")
    .eq("business_id", businessId)
    .eq("id", transactionId)
    .single();
  if (txnError) throw txnError;

  const line = txn as unknown as {
    id: string;
    txn_date: string;
    description: string;
    amount: number | string;
    status: string;
    bank_accounts: { ledger_account_id: string | null } | null;
  };
  if (line.status !== "unmatched") throw new Error("This line is already accounted for.");
  const ledgerAccountId = line.bank_accounts?.ledger_account_id;
  if (!ledgerAccountId) throw new Error("Link this bank account to a ledger account before categorising its lines.");

  const amount = Number(line.amount ?? 0);
  const rule = findMatchingRule(await listBankRules(businessId), { description: line.description, amount });
  if (!rule) throw new Error("No active rule fits this line any more.");

  const memo = `${line.description} (bank rule “${rule.name}”)`;
  const entryId = await createJournalEntry(businessId, {
    postingDate: line.txn_date,
    memo,
    status: "posted",
    lines: categorisationLines(rule, ledgerAccountId, amount, line.description),
    source: { entityType: "bank_transaction", entityId: line.id, ruleKey: "bank.rule", ruleVersion: BANK_RULE_VERSION },
    idempotencyKey: `bank_txn:${line.id}`,
  });

  const {
    data: { user },
  } = await (await createCoreClient({ schema: "core" })).auth.getUser();
  const { error } = await supabase
    .from("bank_transactions")
    .update({
      status: "matched",
      matched_entry_id: entryId,
      matched_at: new Date().toISOString(),
      matched_by: user?.id ?? null,
      rule_id: rule.id,
    })
    .eq("business_id", businessId)
    .eq("id", transactionId)
    .eq("status", "unmatched");
  if (error) throw error;

  return { entryId, ruleName: rule.name };
}
