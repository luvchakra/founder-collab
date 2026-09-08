import { cache } from "react";
import { createClient } from "../../db/server";
import type { EwayBill, EwayBillCredentialsStatus } from "./types";

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

/** S-2's own generation-history read -- see einvoicing/queries.ts's own
 * getEinvoiceForDocument for the same reasoning. */
export const getEwayBillForDocument = cache(
  async (businessId: string, documentId: string): Promise<EwayBill | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("eway_bills")
      .select("*")
      .eq("business_id", businessId)
      .eq("document_id", documentId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
);
