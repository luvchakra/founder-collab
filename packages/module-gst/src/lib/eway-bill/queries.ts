import { cache } from "react";
import { createClient } from "../../db/server";
import type { EwayBillCredentialsStatus } from "./types";

/** Ported from stockpilot-ai-ops's account.tsx `ewbStatus` useQuery. Calls the
 * SECURITY DEFINER status function (never selects the underlying table directly --
 * there is no SELECT grant to do so). Returns null if nothing has been configured yet. */
export const getEwayBillCredentialsStatus = cache(
  async (businessId: string): Promise<EwayBillCredentialsStatus | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("eway_bill_credentials_status", {
      _business: businessId,
    });
    if (error) throw error;
    return data?.[0] ?? null;
  },
);
