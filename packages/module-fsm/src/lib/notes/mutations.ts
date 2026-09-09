import { requireModule } from "@cofounderai/core/licensing/queries";
import { createClient } from "../../db/server";
import type { NoteVisibility } from "./types";

export async function addNote(businessId: string, jobId: string, body: string, visibility: NoteVisibility): Promise<void> {
  await requireModule(businessId, "fsm");
  const trimmed = body.trim();
  if (!trimmed) throw new Error("A note can't be empty.");

  const supabase = await createClient();
  const { error } = await supabase.from("notes").insert({ business_id: businessId, job_id: jobId, body: trimmed, visibility });
  if (error) throw error;
}
