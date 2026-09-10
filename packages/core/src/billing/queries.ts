import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "../db/server";
import type { CreditBalance, CreditPurchase } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

/** Zero when the account has never bought credits (no row yet) rather than an error --
 * ai_credit_balances only gets a row on its first successful payment. */
export async function getCreditBalance(accountId: string): Promise<CreditBalance> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("ai_credit_balances")
    .select("remaining_runs")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw error;
  return { remaining_runs: data?.remaining_runs ?? 0 };
}

export async function listCreditPurchases(accountId: string): Promise<CreditPurchase[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("ai_credit_purchases")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** Spends one purchased run for `accountId` if any remain -- an atomic decrement via the
 * `consume_purchased_ai_credit` Postgres function (core_ai_credit_purchases.sql), not a
 * read-then-write in application code, so two AI calls racing the same balance can't both
 * observe "1 remaining" and both proceed. Returns false (nothing to spend) rather than
 * throwing -- callers treat that as "no purchased headroom left", not a failure. */
export async function consumePurchasedAiCredit(accountId: string, client?: SupabaseClient): Promise<boolean> {
  const supabase = client ?? (await coreClient());
  const { data, error } = await supabase.rpc("consume_purchased_ai_credit", { p_account_id: accountId });
  if (error) throw error;
  return Boolean(data);
}
