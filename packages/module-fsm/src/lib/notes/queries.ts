import { cache } from "react";
import { createClient } from "../../db/server";
import { createClient as createCoreClient } from "@cofounderai/core/db/server";
import type { NoteItem } from "./types";

function coreClient() {
  return createCoreClient({ schema: "core" });
}

export const listNotesForJob = cache(async (businessId: string, jobId: string): Promise<NoteItem[]> => {
  const supabase = await createClient();
  const { data: notes, error } = await supabase
    .from("notes")
    .select("*")
    .eq("business_id", businessId)
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (notes.length === 0) return [];

  const core = await coreClient();
  const authorIds = [...new Set(notes.map((n) => n.author_id))];
  const { data: profiles, error: profilesError } = await core.from("user_profiles").select("id, full_name, email").in("id", authorIds);
  if (profilesError) throw profilesError;
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  return notes.map((n) => ({ ...n, author_name: profileById.get(n.author_id)?.full_name || profileById.get(n.author_id)?.email || "Unknown" }));
});
