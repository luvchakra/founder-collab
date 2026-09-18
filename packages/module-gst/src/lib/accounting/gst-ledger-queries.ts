import { cache } from "react";
import { createClient } from "../../db/server";
import { listAccountRoles } from "./queries";
import { summariseGstLedger, type GstLedgerLine } from "./gst-ledger";

/**
 * The period's tax lines, straight from the ledger.
 *
 * Which accounts count as output vs input is read from the business's own posting roles
 * (`gst_payable`, `input_gst`) rather than hard-coded account numbers, so a business that
 * renamed or re-pointed either account still gets the right answer — the roles are what
 * the posting engine itself resolves, so this and the ledger can never disagree about
 * which account holds output tax.
 */
export const getGstLedgerSummary = cache(
  async (businessId: string, from: string, to: string) => {
    const supabase = await createClient();
    const roles = await listAccountRoles(businessId);

    const outputAccounts = new Set<string>();
    const inputAccounts = new Set<string>();
    for (const [accountId, accountRoles] of roles) {
      if (accountRoles.includes("gst_payable")) outputAccounts.add(accountId);
      if (accountRoles.includes("input_gst")) inputAccounts.add(accountId);
    }

    const relevant = [...outputAccounts, ...inputAccounts];
    if (relevant.length === 0) {
      return { ...summariseGstLedger([]), hasAccounts: false };
    }

    const { data, error } = await supabase
      .from("journal_lines")
      .select("account_id, tax_code, debit, credit, journal_entries(posting_date, status)")
      .eq("business_id", businessId)
      .in("account_id", relevant)
      .not("tax_code", "is", null);
    if (error) throw error;

    type Raw = {
      account_id: string;
      tax_code: string | null;
      debit: number;
      credit: number;
      journal_entries: { posting_date: string; status: string } | null;
    };

    const lines: GstLedgerLine[] = [];
    for (const row of (data ?? []) as unknown as Raw[]) {
      const entry = row.journal_entries;
      // Posted and reversed both count, for the reason `gst.account_balances` documents:
      // a reversed entry still happened, and its reversal is what offsets it. A draft is
      // not in the ledger yet and must never reach a tax return.
      if (!entry || (entry.status !== "posted" && entry.status !== "reversed")) continue;
      if (entry.posting_date < from || entry.posting_date > to) continue;
      lines.push({
        taxCode: row.tax_code,
        debit: Number(row.debit ?? 0),
        credit: Number(row.credit ?? 0),
        direction: outputAccounts.has(row.account_id) ? "output" : "input",
      });
    }

    return { ...summariseGstLedger(lines), hasAccounts: true };
  },
);
