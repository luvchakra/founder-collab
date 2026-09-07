import type { IcpProfile } from "../../lib/icp/types";
import type { ProductProfile } from "../../lib/ai/schemas";

export const DISCOVER_PROSPECTS_PROMPT_VERSION = "v2";

/** Optional, per-run narrowing on top of the ICP's own (broader) criteria -- filled in
 * on the Discover page for a single search, never persisted back to the ICP itself. Any
 * field left blank falls back to the ICP's own corresponding field. */
export type DiscoveryFilters = {
  industry?: string;
  companySize?: string;
  location?: string;
  keywords?: string;
};

export function discoverProspectsPrompt({
  productName,
  productProfile,
  icp,
  knownCompanies,
  filters,
}: {
  productName: string;
  productProfile: ProductProfile;
  icp: IcpProfile;
  knownCompanies: string[];
  filters?: DiscoveryFilters;
}): string {
  const hasFilters =
    filters && (filters.industry || filters.companySize || filters.location || filters.keywords);

  return `You are sourcing net-new sales prospects for ${productName}.

PRODUCT
Category: ${productProfile.category}
Solves: ${productProfile.problem}
Target industries: ${productProfile.target_industries.join(", ")}
Target roles: ${productProfile.target_roles.join(", ")}

IDEAL CUSTOMER PROFILE
${icp.name}: ${icp.description ?? ""}
Industries: ${icp.industries.join(", ")}
Company sizes: ${icp.company_sizes.join(", ")}
Geographies: ${icp.geographies.join(", ")}
Buying signals to look for: ${icp.buying_signals.join(", ")}
Exclude: ${icp.exclusions.join(", ")}
${
  hasFilters
    ? `
NARROW THIS SEARCH TO (set by the founder for this run only -- treat these as hard
constraints, more specific than the ICP fields above; where a field below is set it
replaces the corresponding ICP field, not adds to it):
${filters!.industry ? `Industry: ${filters!.industry}\n` : ""}${filters!.companySize ? `Company size: ${filters!.companySize}\n` : ""}${filters!.location ? `Location: ${filters!.location}\n` : ""}${filters!.keywords ? `Also look for: ${filters!.keywords}\n` : ""}`
    : ""
}
Search the web for real, currently-operating companies that match this ICP${hasFilters ? " and the narrowed search above" : ""}.
Do not suggest any company already in our pipeline:
${knownCompanies.length ? knownCompanies.join(", ") : "(none yet)"}

Find up to 10 distinct companies. For each one, note its name, website, industry,
approximate size, location, a one-line description, and -- most importantly -- a
specific match_reason tying it to the ICP criteria above (not generic filler like
"good fit"). Prefer companies with a visible, recent buying signal (funding, hiring,
expansion, product launch, leadership change) over ones that merely fit the
firmographic profile. Cite the URL where you found each company.

Stop searching as soon as you have enough distinct, well-evidenced companies -- do not
keep searching just because more searches are available. A smaller list where every
company has a real match_reason and source beats a longer one padded with weak fits.`;
}

export function structureDiscoveryPrompt(findings: string): string {
  return `Extract the list of candidate companies from these research findings into
structured form. Only include companies explicitly named in the findings -- do not
invent any. Cap the list at 10.

${findings}`;
}
