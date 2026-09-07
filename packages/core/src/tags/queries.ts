import { createClient } from "../db/server";
import type { Tag } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

export async function listTagsForBusiness(businessId: string, scope?: string): Promise<Tag[]> {
  const supabase = await coreClient();
  let query = supabase.from("tags").select("*").eq("business_id", businessId);
  if (scope) query = query.eq("scope", scope);
  const { data, error } = await query.order("name");
  if (error) throw error;
  return data;
}

/** Every tag attached to one entity, e.g. `listTagsForEntity('party', partyId)`. */
export async function listTagsForEntity(taggableType: string, taggableId: string): Promise<Tag[]> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("taggings")
    .select("tags(*)")
    .eq("taggable_type", taggableType)
    .eq("taggable_id", taggableId);
  if (error) throw error;
  return (data ?? []).flatMap((row: { tags: Tag | Tag[] | null }) =>
    Array.isArray(row.tags) ? row.tags : row.tags ? [row.tags] : [],
  );
}
