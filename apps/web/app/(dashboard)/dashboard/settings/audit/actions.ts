"use server";

import { revalidatePath } from "next/cache";
import { closeBooksThrough, reopenBooks } from "@cofounderai/core/finance/controls";

export type ControlActionState = { error: string } | { success: true } | null;

const SETTINGS_PATH = "/dashboard/settings/audit";

// Authorization (finance.close_period / finance.reopen_period, tenant membership) is
// enforced by the database functions themselves -- these run as the signed-in user.
export async function closeBooksAction(
  businessId: string,
  _prevState: ControlActionState,
  formData: FormData,
): Promise<ControlActionState> {
  const date = String(formData.get("closedThrough") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose a date." };
  try {
    await closeBooksThrough(businessId, date);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't close the books." };
  }
  revalidatePath(SETTINGS_PATH);
  return { success: true };
}

export async function reopenBooksAction(
  businessId: string,
  _prevState: ControlActionState,
  formData: FormData,
): Promise<ControlActionState> {
  const rawDate = String(formData.get("reopenTo") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const date = rawDate === "" ? null : rawDate;
  if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Invalid date." };
  try {
    await reopenBooks(businessId, date, reason);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't reopen the books." };
  }
  revalidatePath(SETTINGS_PATH);
  return { success: true };
}
