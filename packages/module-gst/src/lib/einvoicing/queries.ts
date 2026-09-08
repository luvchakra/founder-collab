import { cache } from "react";
import { createClient } from "../../db/server";
import type { Einvoice, EinvoiceCredentialsStatus } from "./types";

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

/** S-2's own generation-history read -- null when no e-invoice has ever been generated
 * for this document (the common case: most invoices in a demo platform have no GST
 * credentials configured at all). */
export const getEinvoiceForDocument = cache(
  async (businessId: string, documentId: string): Promise<Einvoice | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("einvoices")
      .select("*")
      .eq("business_id", businessId)
      .eq("document_id", documentId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
);
