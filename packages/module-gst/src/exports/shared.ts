import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { ExportColumn } from "@cofounderai/core/exports/types";

/**
 * EXP-FIN-01..17 -- what every Finance export shares.
 *
 * Licence: every adapter is gated on `gst`, the Finance module's licence key.
 *
 * Permissions: the permission catalogue has no Finance *read* key -- every Finance read
 * page is gated by licence and RLS (`tenant AND licensed`) alone, and none of the pages
 * exported here calls `hasPermission` before showing its data (the `gst.*` keys they do
 * check -- `gst.journal.create`, `gst.banking.manage`, `gst.exceptions.manage`,
 * `gst.manage_evidence`, `gst.activation.manage`... -- only switch write actions on).
 * So each adapter's `permissions` is empty, mirroring its page exactly; RLS remains the
 * authoritative read check through the RLS-scoped client every loader uses.
 */
export const FINANCE_LICENCE = "gst";
export const FINANCE_READ_PERMISSIONS: readonly string[] = [];

/** The `<module>` part of every Finance export's file name: `wonderark_finance_<resource>_<date>`. */
export const FINANCE_FILE_MODULE = "finance";

/** The currency the business keeps its books in (`core.business_settings.currency`,
 * INR by default). A ledger has one currency, so it goes on the money columns rather
 * than into a per-row column (§41). */
export async function getLedgerCurrency(businessId: string): Promise<string> {
  const core = await createCoreClient({ schema: "core" });
  const { data, error } = await core.from("business_settings").select("currency").eq("business_id", businessId).maybeSingle();
  if (error) throw error;
  return ((data as { currency?: string | null } | null)?.currency || "INR").toUpperCase();
}

/** A money column: a raw number, formatted by Excel in the ledger currency. */
export function money<T>(key: string, header: string, getValue: (row: T) => unknown, currency: string): ExportColumn<T> {
  return { key, header, type: "currency", currency, getValue };
}
