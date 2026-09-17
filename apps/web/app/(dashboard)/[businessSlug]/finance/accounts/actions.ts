"use server";

import { revalidatePath } from "next/cache";
import { businessPath } from "@/lib/business-path";
import {
  createAccount,
  provisionChartOfAccounts,
  updateAccount,
} from "@cofounderai/module-gst/lib/accounting/mutations";
import type { AccountType } from "@cofounderai/module-gst/lib/accounting/types";
import type { AccountActionState } from "@cofounderai/module-gst/components/accounting/account-modal";

const ACCOUNT_TYPES: AccountType[] = ["asset", "liability", "equity", "income", "cogs", "expense"];

function isAccountType(value: string): value is AccountType {
  return (ACCOUNT_TYPES as string[]).includes(value);
}

async function revalidateAccounts(businessId: string): Promise<void> {
  revalidatePath(`${await businessPath(businessId)}/finance/accounts`);
}

/** Every mutation below re-checks licence and permission inside
 * `lib/accounting/mutations.ts` itself, and RLS decides regardless — the validation here
 * is only about turning form strings into something the mutation can accept, and saying
 * plainly what was wrong when they aren't. */
export async function provisionChartOfAccountsAction(businessId: string): Promise<void> {
  await provisionChartOfAccounts(businessId);
  await revalidateAccounts(businessId);
}

export async function createAccountAction(
  businessId: string,
  _prevState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const accountNumber = String(formData.get("account_number") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  const parentAccountId = String(formData.get("parent_account_id") ?? "").trim() || null;
  const openingBalanceRaw = String(formData.get("opening_balance") ?? "0").trim();

  if (!accountNumber) return { error: "Give the account a number." };
  if (!name) return { error: "Give the account a name." };
  if (!isAccountType(type)) return { error: "Choose what kind of account this is." };

  const openingBalance = openingBalanceRaw === "" ? 0 : Number(openingBalanceRaw);
  if (!Number.isFinite(openingBalance)) {
    return { error: "The opening balance must be a number." };
  }

  try {
    await createAccount(businessId, { accountNumber, name, type, parentAccountId, openingBalance });
  } catch (error) {
    // A duplicate number is the one failure a user can actually fix, and Postgres's own
    // message for it says nothing they'd recognise.
    const message = error instanceof Error ? error.message : "";
    if (message.includes("accounts_business_id_account_number_key") || message.includes("duplicate key")) {
      return { error: `Account ${accountNumber} already exists — pick another number.` };
    }
    return { error: message || "Could not add this account." };
  }

  await revalidateAccounts(businessId);
  return { success: true };
}

export async function updateAccountAction(
  businessId: string,
  accountId: string,
  _prevState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the account a name." };

  try {
    await updateAccount(businessId, accountId, {
      name,
      subtype: String(formData.get("subtype") ?? "").trim() || null,
      isActive: formData.get("is_active") === "on",
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save this account." };
  }

  await revalidateAccounts(businessId);
  return { success: true };
}
