import { cache } from "react";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { Tag } from "./types";

/** `core.tags`/`core.taggings` (D-8) are core-owned, cross-module shared data (the
 * entity-ownership map: "Kickserv work tags vs contact tags = `scope` column") -- FSM
 * uses `scope='work'` for opportunities/jobs, matching the PRD's own §1.10. Queried
 * through `core`'s own schema-scoped client, same reasoning as tenancy/queries.ts. */
function coreClient() {
  return createCoreClient({ schema: "core" });
}

export const listWorkTags = cache(async (businessId: string): Promise<Tag[]> => {
  const supabase = await coreClient();
  const { data, error } = await supabase
    .from("tags")
    .select("id, name, color")
    .eq("business_id", businessId)
    .eq("scope", "work")
    .order("name");
  if (error) throw error;
  return data;
});

/** Tags attached to one taggable row (e.g. one opportunity). No PostgREST embed across
 * `core.tags`/`core.taggings` (they're two separate tables joined only by `tag_id`, same
 * "no embed across these tables" precedent module-inventory's own lib establishes) --
 * joined here in JS instead. */
export const listTagsFor = cache(
  async (businessId: string, taggableType: string, taggableId: string): Promise<Tag[]> => {
    const supabase = await coreClient();
    const { data: taggings, error } = await supabase
      .from("taggings")
      .select("tag_id")
      .eq("business_id", businessId)
      .eq("taggable_type", taggableType)
      .eq("taggable_id", taggableId);
    if (error) throw error;
    if (taggings.length === 0) return [];

    const { data: tags, error: tagsError } = await supabase
      .from("tags")
      .select("id, name, color")
      .in(
        "id",
        taggings.map((t) => t.tag_id),
      );
    if (tagsError) throw tagsError;
    return tags;
  },
);
