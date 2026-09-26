"use server";

import { revalidatePath } from "next/cache";
import { businessPath } from "@/lib/business-path";
import {
  createBankRule,
  deleteBankRule,
  setBankRuleActive,
  updateBankRule,
} from "@cofounderai/module-gst/lib/accounting/bank-rule-mutations";
import { bankRuleProblems } from "@cofounderai/module-gst/lib/accounting/bank-rules";
import type { BankRuleActionState } from "@cofounderai/module-gst/components/accounting/bank-rules-view";

async function revalidateRules(businessId: string): Promise<void> {
  const base = `${await businessPath(businessId)}/finance/banking`;
  revalidatePath(`${base}/rules`);
  // Every bank account page shows rule suggestions, so they are stale too.
  revalidatePath(base, "layout");
}

function amount(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim().replace(/,/g, "");
  return text === "" ? null : Number(text);
}

/** FIN-8: one action for the add and edit form, keyed on whether `rule_id` is set. */
export async function saveBankRuleAction(
  businessId: string,
  _prev: BankRuleActionState,
  formData: FormData,
): Promise<BankRuleActionState> {
  const input = {
    name: String(formData.get("name") ?? ""),
    matchText: String(formData.get("match_text") ?? ""),
    direction: String(formData.get("direction") ?? "any"),
    minAmount: amount(formData.get("min_amount")),
    maxAmount: amount(formData.get("max_amount")),
    accountId: String(formData.get("account_id") ?? ""),
    partyId: String(formData.get("party_id") ?? "") || null,
    priority: Number(String(formData.get("priority") ?? "100").trim() || 100),
  };
  const problems = bankRuleProblems(input);
  if (problems.length > 0) return { error: problems.join(" ") };

  const ruleId = String(formData.get("rule_id") ?? "");
  try {
    if (ruleId) await updateBankRule(businessId, ruleId, input);
    else await createBankRule(businessId, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("bank_rules_business_id_name_key") || message.includes("duplicate key")) {
      return { error: `You already have a rule called "${input.name.trim()}".` };
    }
    return { error: message || "Could not save this rule." };
  }

  await revalidateRules(businessId);
  return { success: true };
}

export async function setBankRuleActiveAction(businessId: string, ruleId: string, isActive: boolean): Promise<void> {
  await setBankRuleActive(businessId, ruleId, isActive);
  await revalidateRules(businessId);
}

export async function deleteBankRuleAction(businessId: string, ruleId: string): Promise<void> {
  await deleteBankRule(businessId, ruleId);
  await revalidateRules(businessId);
}
