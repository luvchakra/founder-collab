"use server";

import { revalidatePath } from "next/cache";
import { businessPath } from "@/lib/business-path";
import {
  completeReconciliation,
  createBankAccount,
  ignoreBankTransaction,
  importBankStatement,
  matchBankTransaction,
  unmatchBankTransaction,
} from "@cofounderai/module-gst/lib/accounting/banking-mutations";
import type { BankAccountActionState } from "@cofounderai/module-gst/components/accounting/bank-account-modal";
import type { ImportActionState } from "@cofounderai/module-gst/components/accounting/bank-import-form";
import type { ReconcileActionState } from "@cofounderai/module-gst/components/accounting/reconcile-form";

async function revalidateBanking(businessId: string, bankAccountId?: string): Promise<void> {
  const base = `${await businessPath(businessId)}/finance/banking`;
  revalidatePath(base);
  if (bankAccountId) revalidatePath(`${base}/${bankAccountId}`);
}

export async function createBankAccountAction(
  businessId: string,
  _prevState: BankAccountActionState,
  formData: FormData,
): Promise<BankAccountActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the account a name." };

  const last4 = String(formData.get("account_number_last4") ?? "").trim();
  if (last4 && !/^\d{2,4}$/.test(last4)) {
    return { error: "The last digits should be 2 to 4 numbers." };
  }

  const openingBalance = Number(String(formData.get("opening_balance") ?? "0").trim() || 0);
  if (!Number.isFinite(openingBalance)) return { error: "The opening balance must be a number." };

  try {
    await createBankAccount(businessId, {
      name,
      bankName: String(formData.get("bank_name") ?? ""),
      accountNumberLast4: last4 || null,
      accountType: String(formData.get("account_type") ?? "current"),
      ledgerAccountId: String(formData.get("ledger_account_id") ?? "").trim() || null,
      openingBalance,
      openingBalanceDate: String(formData.get("opening_balance_date") ?? "").trim() || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("bank_accounts_business_id_name_key") || message.includes("duplicate key")) {
      return { error: `You already have an account called "${name}".` };
    }
    return { error: message || "Could not add this account." };
  }

  await revalidateBanking(businessId);
  return { success: true };
}

/**
 * Takes the statement either way it arrives: a chosen file or pasted text.
 *
 * A founder reconciling on a phone has the statement open in another tab far more often
 * than as a file they can pick, so pasting is a first-class path rather than a fallback.
 */
export async function importBankStatementAction(
  businessId: string,
  bankAccountId: string,
  _prevState: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const file = formData.get("statement_file");
  const pasted = String(formData.get("statement_csv") ?? "").trim();

  let csv = pasted;
  if (file instanceof File && file.size > 0) {
    if (file.size > 5_000_000) {
      return { error: "That file is larger than 5 MB — export a shorter date range." };
    }
    csv = await file.text();
  }

  if (!csv.trim()) {
    return { error: "Choose a statement file, or paste the CSV." };
  }

  try {
    const result = await importBankStatement(businessId, bankAccountId, csv);
    await revalidateBanking(businessId, bankAccountId);
    return result;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not import this statement." };
  }
}

export async function matchBankTransactionAction(
  businessId: string,
  bankAccountId: string,
  transactionId: string,
  entryId: string,
): Promise<void> {
  await matchBankTransaction(businessId, transactionId, entryId);
  await revalidateBanking(businessId, bankAccountId);
}

export async function unmatchBankTransactionAction(
  businessId: string,
  bankAccountId: string,
  transactionId: string,
): Promise<void> {
  await unmatchBankTransaction(businessId, transactionId);
  await revalidateBanking(businessId, bankAccountId);
}

export async function ignoreBankTransactionAction(
  businessId: string,
  bankAccountId: string,
  transactionId: string,
): Promise<void> {
  await ignoreBankTransaction(businessId, transactionId);
  await revalidateBanking(businessId, bankAccountId);
}

export async function reconcileAction(
  businessId: string,
  bankAccountId: string,
  _prevState: ReconcileActionState,
  formData: FormData,
): Promise<ReconcileActionState> {
  const statementStart = String(formData.get("statement_start") ?? "");
  const statementEnd = String(formData.get("statement_end") ?? "");
  const closing = Number(String(formData.get("statement_closing_balance") ?? "").trim());

  if (!/^\d{4}-\d{2}-\d{2}$/.test(statementStart) || !/^\d{4}-\d{2}-\d{2}$/.test(statementEnd)) {
    return { error: "Give the statement's start and end dates." };
  }
  if (statementEnd < statementStart) {
    return { error: "The statement can't end before it starts." };
  }
  if (!Number.isFinite(closing)) {
    return { error: "The closing balance must be a number." };
  }

  try {
    const result = await completeReconciliation(businessId, {
      bankAccountId,
      statementStart,
      statementEnd,
      statementClosingBalance: closing,
      notes: String(formData.get("notes") ?? ""),
    });
    await revalidateBanking(businessId, bankAccountId);
    return { difference: result.difference, reconciled: result.reconciled };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not record this reconciliation." };
  }
}
