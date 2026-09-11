import { createClient } from "../../db/server";
import type { BuyerPersona, PersonaPriority, PersonaRole } from "./types";

type PersonaFieldsInput = {
  title: string;
  roleInCommittee: PersonaRole;
  priority: PersonaPriority;
  notes: string;
};

function personaFieldsToRow(input: PersonaFieldsInput) {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required.");
  return {
    title,
    role_in_committee: input.roleInCommittee,
    priority: input.priority,
    notes: input.notes.trim() || null,
  };
}

export async function createBuyerPersona(workspaceId: string, input: PersonaFieldsInput): Promise<BuyerPersona> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("buyer_personas")
    .insert({ workspace_id: workspaceId, ...personaFieldsToRow(input) })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBuyerPersona(personaId: string, input: PersonaFieldsInput): Promise<BuyerPersona> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("buyer_personas")
    .update(personaFieldsToRow(input))
    .eq("id", personaId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBuyerPersona(personaId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("buyer_personas").delete().eq("id", personaId);
  if (error) throw error;
}
