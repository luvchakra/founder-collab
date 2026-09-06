import { createClient } from "../../db/server";
import type { ProductKnowledge } from "./types";

export async function listProductKnowledge(
  workspaceId: string,
): Promise<ProductKnowledge[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_knowledge")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}
