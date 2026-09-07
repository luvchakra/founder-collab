import { createClient } from "../db/server";
import type { Tag } from "./types";

function coreClient() {
  return createClient({ schema: "core" });
}

export async function createTag(input: {
  businessId: string;
  scope: string;
  name: string;
  color?: string | null;
}): Promise<Tag> {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("tags")
    .insert({ business_id: input.businessId, scope: input.scope, name: input.name, color: input.color ?? null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Idempotent -- tagging the same entity with the same tag twice is a no-op, matching
 * core.taggings' own unique(tag_id, taggable_type, taggable_id). */
export async function tagEntity(input: {
  businessId: string;
  tagId: string;
  taggableType: string;
  taggableId: string;
}): Promise<void> {
  const supabase = await coreClient();
  const { error } = await supabase.from("taggings").upsert(
    {
      business_id: input.businessId,
      tag_id: input.tagId,
      taggable_type: input.taggableType,
      taggable_id: input.taggableId,
    },
    { onConflict: "tag_id,taggable_type,taggable_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function untagEntity(tagId: string, taggableType: string, taggableId: string): Promise<void> {
  const supabase = await coreClient();
  const { error } = await supabase
    .from("taggings")
    .delete()
    .eq("tag_id", tagId)
    .eq("taggable_type", taggableType)
    .eq("taggable_id", taggableId);
  if (error) throw error;
}
