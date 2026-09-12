import { createClient } from "../../db/server";
import { deriveBuyerPersonasFromIcp } from "./derive";
import { listBuyerPersonas } from "./queries";
import type { IcpProfile } from "../icp/types";
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

/** DISC-OFFER-P0-10.1's own "Identify Buyer Personas" pipeline stage. Only ever adds --
 * never edits or removes an existing persona, so a founder's own manual edits (title,
 * committee role, priority, notes) are never silently overwritten by a rerun
 * (§25's own "must NOT silently overwrite user-approved values"). Dedupes case-
 * insensitively against titles already on file (whether founder-created or from a prior
 * run) so re-running AI Discovery after the ICP gains one new role only proposes that one
 * new persona, not the whole set again. Returns however many were actually created (0 is
 * a normal, honest outcome -- e.g. every ICP role already has a persona). */
export async function seedBuyerPersonasFromIcp(workspaceId: string, icp: Pick<IcpProfile, "roles">): Promise<number> {
  const existing = await listBuyerPersonas(workspaceId);
  const existingTitles = new Set(existing.map((p) => p.title.trim().toLowerCase()));

  const toCreate = deriveBuyerPersonasFromIcp(icp).filter((p) => !existingTitles.has(p.title.trim().toLowerCase()));
  for (const persona of toCreate) {
    await createBuyerPersona(workspaceId, persona);
  }
  return toCreate.length;
}
