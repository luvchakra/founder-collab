import { cache } from "react";
import { listContacts } from "../contacts/queries";
import { getIcpProfile } from "../icp/queries";
import { listBuyerPersonas } from "../personas/queries";
import { getProspectResearch } from "../research/queries";
import { computeBuyerIntelligence } from "./intelligence";
import type { BuyerPersonIntelligence } from "./types";

/** cache()-wrapped for the same request-deduplication reason every other read query in
 * this module is. Computed fresh on every call rather than persisted -- contacts,
 * personas, ICP, and research can each change independently, so a stored snapshot would
 * risk going stale (the same reasoning `getBuyingCommitteeForProspect`, 06.2, already
 * established for the subset of this it computes). */
export const getBuyerIntelligenceForProspect = cache(
  async (workspaceId: string, prospectId: string): Promise<BuyerPersonIntelligence[]> => {
    const [contacts, personas, icp, research] = await Promise.all([
      listContacts(prospectId),
      listBuyerPersonas(workspaceId),
      getIcpProfile(workspaceId),
      getProspectResearch(prospectId),
    ]);
    return computeBuyerIntelligence(contacts, personas, icp?.roles ?? [], research?.evidence ?? []);
  },
);
