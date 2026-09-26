import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createClient } from "../../db/server";
import type { BankRule, RuleDirection } from "./bank-rules";

export interface BankRuleRow extends BankRule {
  accountLabel: string;
  partyName: string | null;
}

/** FIN-8: the business's bank rules, in the order they are tried (priority, then name),
 * each naming its account and party for display. RLS (tenant AND licensed) decides
 * visibility. */
export const listBankRules = cache(async (businessId: string): Promise<BankRuleRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_rules")
    .select("id, name, match_text, direction, min_amount, max_amount, account_id, party_id, priority, is_active, accounts(account_number, name)")
    .eq("business_id", businessId)
    .order("priority", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;

  type Raw = {
    id: string;
    name: string;
    match_text: string;
    direction: RuleDirection;
    min_amount: number | string | null;
    max_amount: number | string | null;
    account_id: string;
    party_id: string | null;
    priority: number;
    is_active: boolean;
    accounts: { account_number: string; name: string } | null;
  };
  const rows = (data ?? []) as unknown as Raw[];

  const partyIds = [...new Set(rows.map((r) => r.party_id).filter((p): p is string => !!p))];
  const partyNames = new Map<string, string>();
  if (partyIds.length > 0) {
    const core = await createCoreClient({ schema: "core" });
    const { data: parties, error: partyError } = await core.from("parties").select("id, name").eq("business_id", businessId).in("id", partyIds);
    if (partyError) throw partyError;
    for (const p of (parties ?? []) as { id: string; name: string }[]) partyNames.set(p.id, p.name);
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    matchText: r.match_text,
    direction: r.direction,
    minAmount: r.min_amount === null ? null : Number(r.min_amount),
    maxAmount: r.max_amount === null ? null : Number(r.max_amount),
    accountId: r.account_id,
    partyId: r.party_id,
    priority: r.priority,
    isActive: r.is_active,
    accountLabel: r.accounts ? `${r.accounts.account_number} ${r.accounts.name}` : "Unknown account",
    partyName: r.party_id ? (partyNames.get(r.party_id) ?? null) : null,
  }));
});
