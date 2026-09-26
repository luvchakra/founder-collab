"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { businessPath } from "@/lib/business-path";
import {
  createJournalEntry,
  postJournalEntry,
  reverseJournalEntry,
} from "@cofounderai/module-gst/lib/accounting/journal-mutations";
import type { JournalEntryFormState } from "@cofounderai/module-gst/components/accounting/journal-entry-form";

async function revalidateJournal(businessId: string): Promise<string> {
  const base = `${await businessPath(businessId)}/finance`;
  revalidatePath(`${base}/journal`);
  // A posting changes every account's balance, so the chart of accounts is stale too.
  revalidatePath(`${base}/accounts`);
  return base;
}

/**
 * One action for both buttons on the manual-entry form, keyed on which was pressed:
 * "Save as draft" and "Post entry" differ only in the status the entry is created with,
 * and splitting them would duplicate the whole of the parsing below.
 *
 * The form submits its lines as parallel fields, which is what a plain multi-row form
 * gives you; a line with no account is a row someone added and left blank, not an error.
 */
export async function createJournalEntryAction(
  businessId: string,
  _prevState: JournalEntryFormState,
  formData: FormData,
): Promise<JournalEntryFormState> {
  const status = formData.get("intent") === "post" ? "posted" : "draft";
  const accountIds = formData.getAll("account_id").map(String);
  const debits = formData.getAll("debit").map(String);
  const credits = formData.getAll("credit").map(String);
  const memos = formData.getAll("line_memo").map(String);
  // FIN-9: optional dimensions, entry-wide. Absent unless the business switched them on.
  const location = String(formData.get("location") ?? "").trim() || null;
  const projectRef = String(formData.get("project_ref") ?? "").trim() || null;

  const lines = accountIds
    .map((accountId, i) => ({
      accountId,
      debit: Number(debits[i] ?? 0) || 0,
      credit: Number(credits[i] ?? 0) || 0,
      memo: (memos[i] ?? "").trim() || null,
      location,
      projectRef,
    }))
    .filter((line) => line.accountId);

  if (lines.length === 0) {
    return { error: "Choose an account on at least two lines." };
  }
  if (lines.some((line) => !Number.isFinite(line.debit) || !Number.isFinite(line.credit))) {
    return { error: "Amounts have to be numbers." };
  }

  let entryId: string;
  try {
    entryId = await createJournalEntry(businessId, {
      postingDate: String(formData.get("posting_date") ?? ""),
      memo: String(formData.get("memo") ?? "").trim() || null,
      lines,
      status,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save this entry." };
  }

  const base = await revalidateJournal(businessId);
  redirect(`${base}/journal/${entryId}`);
}

export async function postJournalEntryAction(businessId: string, entryId: string): Promise<void> {
  await postJournalEntry(businessId, entryId);
  const base = await revalidateJournal(businessId);
  revalidatePath(`${base}/journal/${entryId}`);
}

export async function reverseJournalEntryAction(businessId: string, entryId: string): Promise<void> {
  const reversalId = await reverseJournalEntry(businessId, entryId);
  const base = await revalidateJournal(businessId);
  revalidatePath(`${base}/journal/${entryId}`);
  redirect(`${base}/journal/${reversalId}`);
}
