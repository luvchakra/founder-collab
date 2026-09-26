import { createClient } from "../../db/server";
import type { Contact } from "./types";

export async function listContacts(prospectId: string): Promise<Contact[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}
