import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import { requireModule } from "@cofounderai/core/licensing/queries";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

/** Finds-or-creates a `scope='work'` tag by name, then attaches it to the given taggable
 * row. Tags "cannot be applied at record-creation time" (PRD §1.10) -- this is only ever
 * called from an already-existing opportunity/job's own detail page. */
export async function addWorkTag(
  businessId: string,
  taggableType: string,
  taggableId: string,
  tagName: string,
): Promise<void> {
  await requireModule(businessId, "fsm");
  const supabase = await coreClient();
  const trimmed = tagName.trim();
  if (!trimmed) throw new Error("Tag name cannot be empty.");

  const { data: existing, error: findError } = await supabase
    .from("tags")
    .select("id")
    .eq("business_id", businessId)
    .eq("scope", "work")
    .eq("name", trimmed)
    .maybeSingle();
  if (findError) throw findError;

  let tagId = existing?.id;
  if (!tagId) {
    const { data: created, error: createError } = await supabase
      .from("tags")
      .insert({ business_id: businessId, scope: "work", name: trimmed })
      .select("id")
      .single();
    if (createError) throw createError;
    tagId = created.id;
  }

  const { error } = await supabase
    .from("taggings")
    .insert({ business_id: businessId, tag_id: tagId, taggable_type: taggableType, taggable_id: taggableId });
  if (error) throw error;
}

export async function removeWorkTag(businessId: string, tagId: string, taggableId: string): Promise<void> {
  await requireModule(businessId, "fsm");
  const supabase = await coreClient();
  const { error } = await supabase
    .from("taggings")
    .delete()
    .eq("business_id", businessId)
    .eq("tag_id", tagId)
    .eq("taggable_id", taggableId);
  if (error) throw error;
}
