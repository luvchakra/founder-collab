import type { IcpProfile } from "../../lib/icp/types";
import type { ProductProfile } from "../../lib/ai/schemas";

export const DISCOVER_PROSPECTS_PROMPT_VERSION = "v1";

export function discoverProspectsPrompt({
  productName,
  productProfile,
  icp,
  knownCompanies,
}: {
  productName: string;
  productProfile: ProductProfile;
  icp: IcpProfile;
  knownCompanies: string[];
}): string {
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

Search the web for real, currently-operating companies that match this ICP.
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
