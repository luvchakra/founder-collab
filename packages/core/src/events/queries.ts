import { createClient } from "../db/server";
import type { DomainEvent } from "./types";

export async function listDomainEventsForBusiness(businessId: string): Promise<DomainEvent[]> {
  const supabase = await createClient({ schema: "core" });
  const { data, error } = await supabase
    .from("domain_events")
    .select("*")
    .eq("business_id", businessId)
    .order("published_at", { ascending: false });
  if (error) throw error;
  return data;
}
