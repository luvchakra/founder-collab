import { cache } from "react";
import { createClient } from "../../db/server";
import { listContacts } from "../contacts/queries";
import { listBuyerPersonas } from "../personas/queries";
import { matchBuyingCommittee } from "./match-committee";
import type { BuyingCommitteeMatch, ResearchBrief } from "./types";

export const getResearchBrief = cache(async (prospectId: string): Promise<ResearchBrief | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_briefs")
    .select("*")
    .eq("prospect_id", prospectId)
    .maybeSingle();
  if (error) throw error;
  return data;
});

/** Deterministic, computed fresh every call rather than stored -- contacts and personas
 * can each change independently of the other, so a persisted snapshot would risk going
 * stale (see `match-committee.ts`'s own comment on why this has nothing to invent). */
export async function getBuyingCommitteeForProspect(workspaceId: string, prospectId: string): Promise<BuyingCommitteeMatch[]> {
  const [contacts, personas] = await Promise.all([listContacts(prospectId), listBuyerPersonas(workspaceId)]);
  return matchBuyingCommittee(contacts, personas);
}
