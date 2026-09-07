import { cache } from "react";
import { createClient } from "../../db/server";
import type { EinvoiceCredentialsStatus } from "./types";

/** Ported from stockpilot-ai-ops's account.tsx `einvStatus` useQuery -- see
 * eway-bill/queries.ts's own docstring for the same shape/reasoning. */
export const getEinvoiceCredentialsStatus = cache(
  async (businessId: string): Promise<EinvoiceCredentialsStatus | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("einvoice_credentials_status", {
      _business: businessId,
    });
    if (error) throw error;
    return data?.[0] ?? null;
  },
);
