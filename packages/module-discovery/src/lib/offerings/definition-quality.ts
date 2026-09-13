import type { ProductProfile } from "../ai/schemas";
import type { IcpProfile } from "../icp/types";
import type { BuyerPersona } from "../personas/types";

/**
 * DISC-OFFER-P1-03.1: "Offering Definition Quality" -- the doc's own worked example
 * ("Offering Definition Quality: 86/100" over five named dimensions, each labeled
 * Strong/Medium). Pure and deterministic (CLAUDE.md dev principle #4 -- no LLM for a
 * computable diagnostic), the same discipline `lib/pipeline/review.ts`
 * (DISC-OFFER-P1-02.1) already established for a comparable "how much should a founder
 * trust this" question -- this file's own three-tier vocabulary and thresholds are kept
 * independent of that one rather than imported, since they're answering a genuinely
 * different question (definitional completeness of the offering itself, not a pipeline
 * stage's own run-to-run confidence) over a different, wider set of inputs.
 */
export type QualityLevel = "strong" | "medium" | "weak";

export type OfferingDefinitionQualityDimension =
  | "description"
  | "target_customer"
  | "icp_evidence"
  | "buyer_evidence"
  | "differentiation";

export const QUALITY_DIMENSION_LABEL: Record<OfferingDefinitionQualityDimension, string> = {
  description: "Description",
  target_customer: "Target Customer",
  icp_evidence: "ICP Evidence",
  buyer_evidence: "Buyer Evidence",
  differentiation: "Differentiation",
};

export const QUALITY_LEVEL_LABEL: Record<QualityLevel, string> = {
  strong: "Strong",
  medium: "Medium",
  weak: "Weak",
};

export type OfferingDefinitionQuality = {
  overall: number;
  dimensions: Record<OfferingDefinitionQualityDimension, QualityLevel>;
};

const LEVEL_SCORE: Record<QualityLevel, number> = { strong: 100, medium: 60, weak: 20 };

function wordCount(text: string | null | undefined): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Strong needs real substance (15+ words -- roughly a couple of full sentences, not
 * just a name repeated); any non-empty text still beats nothing at all. */
function classifyDescription(text: string | null | undefined): QualityLevel {
  const words = wordCount(text);
  if (words >= 15) return "strong";
  if (words > 0) return "medium";
  return "weak";
}

/** "Target Customer" is the doc's own "who buys it/where" -- the three ICP fields that
 * most directly answer that (industries/company sizes/roles), not the full twelve-field
 * ICP shape (pain points, buying signals, etc. answer other questions this diagnostic
 * doesn't ask). All three populated is strong; any is medium; none (or no ICP at all) is
 * weak. */
function classifyTargetCustomer(icp: IcpProfile | null): QualityLevel {
  if (!icp) return "weak";
  const populated = [icp.industries, icp.company_sizes, icp.roles].filter((list) => list.length > 0).length;
  if (populated === 3) return "strong";
  if (populated > 0) return "medium";
  return "weak";
}

/** Distinct from `target_customer` above -- this is how *well-supported* the ICP itself
 * is (DISC-OFFER-P0-13.1's own `confidence`/`evidence` fields), not which fields it has.
 * A null `confidence` means genuinely never computed (13.1's own "no false precision" --
 * a different fact from "computed and found unconfident"), so it reads as `weak` here:
 * there is no automated evidence behind this ICP at all yet, regardless of how many
 * fields a founder may have filled in by hand. */
function classifyIcpEvidence(icp: IcpProfile | null): QualityLevel {
  if (!icp || icp.confidence === null) return "weak";
  if (icp.confidence >= 0.7 && icp.evidence.length > 0) return "strong";
  if (icp.confidence >= 0.4 || icp.evidence.length > 0) return "medium";
  return "weak";
}

/** At least two personas with at least one carrying real notes (not just a bare title)
 * is strong evidence of a considered buying committee; any persona at all beats none. */
function classifyBuyerEvidence(personas: BuyerPersona[]): QualityLevel {
  const withNotes = personas.filter((p) => wordCount(p.notes) > 0).length;
  if (personas.length >= 2 && withNotes > 0) return "strong";
  if (personas.length > 0) return "medium";
  return "weak";
}

/** Both a real differentiator list (2+, not one throwaway line) and a substantive
 * competitive-positioning statement (5+ words, not a fragment) together make a strong
 * case; either alone is medium; neither is weak. */
function classifyDifferentiation(profile: ProductProfile | null): QualityLevel {
  if (!profile) return "weak";
  const hasDifferentiators = profile.differentiators.length >= 2;
  const hasPositioning = wordCount(profile.competitive_positioning) >= 5;
  if (hasDifferentiators && hasPositioning) return "strong";
  if (hasDifferentiators || hasPositioning) return "medium";
  return "weak";
}

/**
 * `description` prefers the founder's own longer-form text (`detailed_description`,
 * DISC-OFFER-P0-01.1) over the AI's own concise 1-2 sentence summary
 * (`productProfile.description`) when both exist -- a founder's own fuller account of
 * their offering is the more informative signal of how well-described it actually is.
 */
export function computeOfferingDefinitionQuality(input: {
  detailedDescription: string | null;
  icp: IcpProfile | null;
  personas: BuyerPersona[];
  productProfile: ProductProfile | null;
}): OfferingDefinitionQuality {
  const dimensions: Record<OfferingDefinitionQualityDimension, QualityLevel> = {
    description: classifyDescription(input.detailedDescription ?? input.productProfile?.description),
    target_customer: classifyTargetCustomer(input.icp),
    icp_evidence: classifyIcpEvidence(input.icp),
    buyer_evidence: classifyBuyerEvidence(input.personas),
    differentiation: classifyDifferentiation(input.productProfile),
  };
  const scores = Object.values(dimensions).map((level) => LEVEL_SCORE[level]);
  const overall = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  return { overall, dimensions };
}
