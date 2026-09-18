"use server";

import { revalidatePath } from "next/cache";
import { businessPath } from "@/lib/business-path";
import {
  createRecurringEntry,
  setRecurringEntryActive,
} from "@cofounderai/module-gst/lib/accounting/recurring-mutations";
import type { RecurrenceFrequency } from "@cofounderai/module-gst/lib/accounting/recurring";
import type { RecurringEntryActionState } from "@cofounderai/module-gst/components/accounting/recurring-entry-modal";

const FREQUENCIES: RecurrenceFrequency[] = ["monthly", "quarterly", "half_yearly", "annually"];

function isFrequency(value: string): value is RecurrenceFrequency {
  return (FREQUENCIES as string[]).includes(value);
}

async function revalidateRecurring(businessId: string): Promise<void> {
  revalidatePath(`${await businessPath(businessId)}/finance/recurring`);
}

export async function createRecurringEntryAction(
  businessId: string,
  _prevState: RecurringEntryActionState,
  formData: FormData,
): Promise<RecurringEntryActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const frequency = String(formData.get("frequency") ?? "");
  const anchorDate = String(formData.get("anchor_date") ?? "");
  const endOn = String(formData.get("end_on") ?? "").trim() || null;

  if (!name) return { error: "Give it a name." };
  if (!isFrequency(frequency)) return { error: "Choose how often it should run." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) return { error: "Give it a start date." };
  if (endOn && endOn < anchorDate) return { error: "The end date can't be before the start date." };

  const accountIds = formData.getAll("account_id").map(String);
  const debits = formData.getAll("debit").map(String);
  const credits = formData.getAll("credit").map(String);

  const lines = accountIds
    .map((accountId, i) => ({
      accountId,
      debit: Number(debits[i] ?? 0) || 0,
      credit: Number(credits[i] ?? 0) || 0,
    }))
    .filter((line) => line.accountId);

  if (lines.some((l) => !Number.isFinite(l.debit) || !Number.isFinite(l.credit))) {
    return { error: "Amounts have to be numbers." };
  }

  try {
    await createRecurringEntry(businessId, { name, frequency, anchorDate, endOn, lines });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("recurring_entries_business_id_name_key") || message.includes("duplicate key")) {
      return { error: `You already have a recurring entry called "${name}".` };
    }
    return { error: message || "Could not create this recurring entry." };
  }

  await revalidateRecurring(businessId);
  return { success: true };
}

export async function setRecurringEntryActiveAction(
  businessId: string,
  id: string,
  isActive: boolean,
): Promise<void> {
  await setRecurringEntryActive(businessId, id, isActive);
  await revalidateRecurring(businessId);
}
