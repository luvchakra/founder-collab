import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { createClient } from "../../db/server";
import {
  resolveDimensionSettings,
  summariseByDimension,
  type DimensionKey,
  type DimensionReportRow,
  type DimensionSetting,
  type DimensionTotalRow,
} from "./derive";
import type { AccountType } from "../accounting/types";

/** FIN-9: the business's four dimensions, off and default-named unless configured. */
export const getDimensionSettings = cache(async (businessId: string): Promise<DimensionSetting[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dimension_settings")
    .select("dimension_key, enabled, label")
    .eq("business_id", businessId);
  if (error) throw error;
  return resolveDimensionSettings((data ?? []) as { dimension_key: string; enabled: boolean; label: string | null }[]);
});

/**
 * FIN-9: profit and loss by one dimension for a period, aggregated in SQL
 * (`gst.dimension_totals`) and named here — party and item values are ids into the
 * canonical `core.parties`/`core.items`, looked up rather than copied; location and
 * project are the text people typed.
 */
export async function getDimensionReport(businessId: string, key: DimensionKey, from: string, to: string): Promise<DimensionReportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dimension_totals", { p_business_id: businessId, p_dimension: key, p_from: from, p_to: to });
  if (error) throw error;

  type Row = { dimension_value: string | null; account_type: AccountType; debit: number | string; credit: number | string };
  const rows: DimensionTotalRow[] = ((data ?? []) as Row[]).map((r) => ({
    value: r.dimension_value,
    accountType: r.account_type,
    debit: Number(r.debit ?? 0),
    credit: Number(r.credit ?? 0),
  }));

  const names = new Map<string, string>();
  const ids = [...new Set(rows.map((r) => r.value).filter((v): v is string => !!v))];
  if ((key === "party" || key === "item") && ids.length > 0) {
    const core = await createCoreClient({ schema: "core" });
    const { data: named, error: nameError } = await core
      .from(key === "party" ? "parties" : "items")
      .select("id, name")
      .eq("business_id", businessId)
      .in("id", ids);
    if (nameError) throw nameError;
    for (const n of (named ?? []) as { id: string; name: string }[]) names.set(n.id, n.name);
  }
  return summariseByDimension(rows, names);
}
