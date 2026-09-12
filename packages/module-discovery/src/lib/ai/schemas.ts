import { z } from "zod";
import { OFFERING_TYPE_VALUES } from "../offerings/types";

/**
 * Structured product understanding output (blueprint §12, §17). Every field must be
 * traceable to the source material the model was given -- see
 * prompts/product/understand_product_v1.ts for the anti-hallucination instructions.
 */
export const ProductProfileSchema = z.object({
  description: z
    .string()
    .describe(
      "A concise 1-2 sentence plain-language summary of the product, suitable as its short description",
    ),
  category: z
    .string()
    .describe("What kind of product this is, e.g. 'B2B SaaS - invoice reconciliation'"),
  problem: z.string().describe("The problem this product solves, per the sources"),
  solution: z.string().describe("How the product solves it"),
  features: z.array(z.string()),
  differentiators: z.array(z.string()),
  target_industries: z.array(z.string()),
  target_roles: z.array(z.string()),
  use_cases: z.array(z.string()),
  pricing_summary: z
    .string()
    .nullable()
    .describe("Null if pricing is not mentioned anywhere in the sources"),
  competitive_positioning: z.string(),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "0-1. Lower for thin sources (e.g. a one-line description), higher for detailed ones.",
    ),
});

export type ProductProfile = z.infer<typeof ProductProfileSchema>;

/**
 * Structured business understanding output -- the business-level equivalent of
 * ProductProfileSchema above, just the two fields the "create a business from its
 * website" flow (create-business-modal.tsx) actually populates. See
 * prompts/business/understand_business_v1.ts.
 */
export const BusinessProfileSchema = z.object({
  name: z.string().describe("The business's real, official name -- not the domain"),
  description: z
    .string()
    .describe("A plain-language 1-3 sentence summary of what the business does and who it serves"),
});

export type BusinessProfile = z.infer<typeof BusinessProfileSchema>;

/**
 * Structured ICP draft output (blueprint §13, §19). Generated from a ProductProfile --
 * see prompts/icp/generate_icp_v1.ts.
 */
export const IcpProfileSchema = z.object({
  name: z.string().describe("A short label for this ICP, e.g. 'Enterprise Banks'"),
  description: z.string(),
  industries: z.array(z.string()),
  company_sizes: z
    .array(z.string())
    .describe("e.g. '50-200 employees', '2,000-50,000 employees'"),
  geographies: z.array(z.string()),
  roles: z.array(z.string()).describe("Job titles/roles of likely buyers"),
  pain_points: z.array(z.string()),
  buying_signals: z.array(z.string()),
  exclusions: z
    .array(z.string())
    .describe("Company types that look similar but are NOT a good fit, and why"),
  /** DISC-OFFER-P0-02.2's own field-list additions to the ICP Builder. */
  revenue: z.array(z.string()).describe("Typical annual revenue ranges of a good-fit company, e.g. '$10M-$50M'"),
  business_model: z.array(z.string()).describe("e.g. 'B2B SaaS', 'Marketplace', 'Direct-to-consumer'"),
  technology: z.array(z.string()).describe("Technologies/platforms a good-fit company is likely already using"),
  growth_stage: z.array(z.string()).describe("e.g. 'Seed', 'Series A-B', 'Growth', 'Enterprise/mature'"),
  existing_tools: z.array(z.string()).describe("Categories of tool a good-fit company likely already has, that this offering complements or replaces"),
  /** DISC-OFFER-P0-13.1: the doc's own worked ICP example names these two alongside the
   * list fields above. Deliberately a plain `string[]` for evidence, not the richer
   * `EvidenceItemSchema` below -- see the migration's own comment for why that shape
   * (built for multiple, dated, first-party-vs-external sources gathered across several
   * calls) doesn't fit a single-call synthesis over one already-approved product profile. */
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "0-1. How well-supported this ICP is by the product profile -- lower if the profile is thin or generic, higher if it gives specific, detailed signal to derive an ICP from.",
    ),
  evidence: z
    .array(z.string())
    .describe(
      "Short quotes or close paraphrases from the product profile that ground this ICP's key claims (industries, pain points, roles, exclusions, etc.). Do not invent claims the profile doesn't support -- an empty array is a valid answer if the profile gives nothing concrete to quote.",
    ),
});

export type IcpProfileDraft = z.infer<typeof IcpProfileSchema>;

/**
 * Evidence model (blueprint §33; extended by DISC-OFFER-P0-06.1 "Evidence-Backed
 * Research"): every claim distinguishes FACT / INFERENCE / ASSUMPTION / UNKNOWN
 * (`evidence_type` -- the doc's own "Verified fact / Inference / Hypothesis /
 * Insufficient evidence", same four-way split, see `EVIDENCE_TYPE_LABEL` in
 * lib/research/types.ts) rather than being asserted flatly. `confidence` is a
 * deliberately separate dimension from `evidence_type` -- how sure the model is the
 * statement is accurate, independent of what *kind* of claim it is (a clearly-stated
 * fact from an ambiguous source can be lower confidence than a well-reasoned
 * inference from a clearly authoritative one) -- the same "type vs. how sure" split
 * `timingStrength`/`confidence` already established for Why Now (05.4). Used by
 * prospect research.
 */
export const EvidenceItemSchema = z.object({
  statement: z.string(),
  source: z.string().nullable().describe('What kind of source this is (e.g. "company website", "news article", "LinkedIn profile"), or null if unclear'),
  source_url: z.string().nullable().describe("URL where this was found, or null"),
  observed_at: z.string().nullable().describe("Date the source was published or the event happened, if stated, or null"),
  supporting_signal: z
    .string()
    .nullable()
    .describe("The exact text of the buying_signal or recent_event this evidence backs, if any, or null"),
  evidence_type: z.enum(["fact", "inference", "assumption", "unknown"]),
  confidence: z.enum(["low", "medium", "high"]),
  /** DISC-OFFER-P0-12.2: "Clearly distinguish first-party website evidence from
   * external evidence" -- which of the two labeled findings blocks
   * `structureResearchPrompt` (research_prospect_v3) fed the model this claim actually
   * came from. */
  source_type: z.enum(["first_party", "external"]),
});

/**
 * Structured prospect research output (blueprint §16, §32-34). Produced by structuring
 * raw web-search findings -- see prompts/research/research_prospect_v1.ts. The model must
 * not invent evidence; empty arrays / "not found" are valid answers.
 */
export const ProspectResearchSchema = z.object({
  summary: z.string(),
  pain_points: z.array(z.string()),
  buying_signals: z.array(z.string()),
  recent_events: z.array(z.string()),
  recommended_angle: z.string(),
  evidence: z.array(EvidenceItemSchema),
});

export type ProspectResearchDraft = z.infer<typeof ProspectResearchSchema>;

/**
 * Structured outreach strategy output (blueprint §18, §35). "Do not immediately ask
 * 'write an email' -- first establish WHY THIS COMPANY, WHY THIS PERSON, WHY NOW, WHAT
 * ANGLE, WHAT CHANNEL, WHAT CTA." `strategy` is the synthesized why-narrative;
 * `key_message` and `cta` are what actually gets used when Epic 8 generates the message.
 */
export const OutreachStrategySchema = z.object({
  strategy: z
    .string()
    .describe(
      "The strategic narrative: why this company, why this person (if known), why now -- tied to specific research evidence, not generic",
    ),
  channel: z.enum(["email", "linkedin", "whatsapp"]),
  reason: z.string().describe("One-line rationale for approaching this prospect now"),
  key_message: z.string().describe("The core angle/message to lead with"),
  cta: z.string().describe("The specific call to action"),
});

export type OutreachStrategyDraft = z.infer<typeof OutreachStrategySchema>;

/**
 * DISC-OFFER-P0-06.2: "Offering Research Brief" -- deliberately small: everything else
 * the doc's own field list asks for (Company, Why Now, Evidence, Recommended Action,
 * Likely Buyer/Buying Committee) already exists elsewhere and is referenced when a
 * brief is rendered, not regenerated by this call (see the research_briefs migration's
 * own comment for the full mapping). This schema is only the genuinely new synthesis.
 */
export const ResearchBriefSchema = z.object({
  offering_fit: z
    .string()
    .describe("Why this company is (or is not) a fit for the offering, grounded in the research and ICP -- becomes the opportunity's own why_them"),
  problem_hypothesis: z
    .string()
    .describe("The specific problem this company likely has that the offering addresses, based on the research -- not a generic pitch"),
  potential_objection: z
    .string()
    .describe("The most likely reason this prospect says no or hesitates, grounded in the research/negative signals given, not invented"),
  suggested_opening: z
    .string()
    .describe("A one-to-two sentence opening angle for a first outreach message, tied to specific research evidence"),
  confidence: z
    .enum(["low", "medium", "high"])
    .describe("Overall confidence in this brief given how much real evidence backs it -- low if the research was thin"),
});

export type ResearchBriefDraft = z.infer<typeof ResearchBriefSchema>;

/**
 * Structured outreach message output (blueprint §19, §36, §39). Generated from an
 * *approved* strategy, never directly from "write an email" -- see
 * prompts/outreach/generate_message_v1.ts.
 */
export const OutreachMessageSchema = z.object({
  subject: z
    .string()
    .nullable()
    .describe("Email subject line; null for linkedin/whatsapp (no subject line)"),
  body: z.string(),
});

export type OutreachMessageDraft = z.infer<typeof OutreachMessageSchema>;

/**
 * Reply classification output (blueprint §21, Epic 9). Produced from an inbound message's
 * content -- see prompts/outreach/classify_reply_v1.ts.
 */
export const ReplyClassificationSchema = z.object({
  classification: z.enum([
    "interested",
    "not_interested",
    "question",
    "objection",
    "out_of_office",
    "unsubscribe",
    "other",
  ]),
  recommended_action: z
    .string()
    .describe("One short, concrete next step for the founder, e.g. 'Send pricing and offer a demo'"),
});

export type ReplyClassificationDraft = z.infer<typeof ReplyClassificationSchema>;

/**
 * Structured output for a single AI-discovered prospect candidate. Produced by
 * structuring raw web-search findings -- see prompts/prospecting/discover_prospects_v1.ts.
 * Mirrors ProspectResearchSchema's discipline: the model must not invent companies,
 * only extract ones explicitly named in the findings it already gathered.
 */
export const DiscoveredProspectSchema = z.object({
  company_name: z.string(),
  website: z.string().nullable(),
  industry: z.string().nullable(),
  company_size: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string(),
  match_reason: z
    .string()
    .describe("Why this company fits the ICP, tied to specific ICP criteria -- not generic filler"),
  source_url: z.string().nullable().describe("URL where this company was found, or null"),
});

export const DiscoveredProspectsSchema = z.object({
  prospects: z.array(DiscoveredProspectSchema).max(10),
});

export type DiscoveredProspect = z.infer<typeof DiscoveredProspectSchema>;

/**
 * "Let AI Auto-populate Products from website" output (lib/ai/discover-products.ts) --
 * deliberately just name + website, per the actual ask: "just get the product name and
 * product specific website link." Nothing else is invented here; a full profile is
 * still generated per-product afterward via the existing understandProduct() once each
 * product row exists (same two-step split createProductsBulk's import path already
 * uses for prospects).
 */
export const DiscoveredProductSchema = z.object({
  name: z.string(),
  website: z.string().nullable().describe("The product's own page on the business's site, or null if it shares the business's own homepage"),
});

export const DiscoveredProductsSchema = z.object({
  products: z.array(DiscoveredProductSchema).max(30),
});

export type DiscoveredProduct = z.infer<typeof DiscoveredProductSchema>;

/**
 * Import restructuring output (lib/ai/restructure-import.ts) -- an uploaded file (a CSV/
 * Excel export with unrecognized headers, or PDF text with no structure at all) mapped
 * into the same shape the deterministic CSV importer (lib/prospects/csv.ts) already
 * produces, so both paths feed the same dedup + insert logic. `company_name` is the only
 * required field; anything the source data doesn't have simply comes back null rather
 * than invented.
 */
export const RestructuredProspectSchema = z.object({
  company_name: z.string(),
  website: z.string().nullable(),
  industry: z.string().nullable(),
  company_size: z.string().nullable(),
  location: z.string().nullable(),
  description: z.string().nullable(),
});

export const RestructuredProspectsSchema = z.object({
  prospects: z.array(RestructuredProspectSchema).max(200),
});

/**
 * Structured header-chat assistant output (see lib/ai/chat.ts). `followUp` is rendered
 * as a clickable suggestion that prefills the input box -- the founder still has to hit
 * Send, so it's just a starting point, not an auto-continued conversation.
 */
export const ChatResponseSchema = z.object({
  answer: z
    .string()
    .describe(
      "Answer to the founder's question, in markdown-lite: **bold** for key terms, " +
        "[text](url) for links (internal portal paths or external sources). Concise -- " +
        "a few sentences, not an essay.",
    ),
  followUp: z
    .string()
    .describe(
      "One natural follow-up message the founder might send next, given this context " +
        "and conversation so far. Phrase it in the founder's own voice, as a short, " +
        "complete sentence starting with 'I would like to...' or 'I want to...' -- " +
        "never as a question posed back to the founder (e.g. never 'Would you like " +
        "to...?'), since this is prefilled into the founder's own message box for them " +
        "to send as-is.",
    ),
});

export type ChatResponse = z.infer<typeof ChatResponseSchema>;

/**
 * DISC-OFFER-P0-02.1's "Offering Setup Wizard" -- structures a founder's own
 * natural-language description ("We provide managed IAM services to mid-size financial
 * companies") straight into the flat Offering fields DISC-OFFER-P0-01.1 added, with NO
 * website research step (unlike `ProductProfileSchema` above, which requires one) --
 * this only restates what the founder already typed, it never invents anything they
 * didn't say. Every field is nullable: "AI does not silently save inferred information
 * as fact" means a short or ambiguous description should come back mostly null rather
 * than a confident guess, and the caller never writes this straight to the database --
 * it's returned to the create/edit dialog as an editable proposal only.
 */
export const OfferingProfileSuggestionSchema = z.object({
  offeringType: z
    .enum(OFFERING_TYPE_VALUES as [string, ...string[]])
    .nullable()
    .describe("Best-fit offering type, or null if the description doesn't make one clear"),
  category: z.string().nullable().describe("A short category label, e.g. 'B2B SaaS - invoice reconciliation', or null"),
  primaryProblem: z.string().nullable().describe("The problem this offering solves, only if stated or clearly implied"),
  targetMarket: z.string().nullable().describe("Who normally buys it, only if stated or clearly implied"),
  valueProposition: z.string().nullable().describe("Why customers choose it over alternatives, only if stated or clearly implied"),
  confidence: z.number().min(0).max(1).describe("0-1, lower for a one-line description, higher for a detailed one"),
});

export type OfferingProfileSuggestion = z.infer<typeof OfferingProfileSuggestionSchema>;

/**
 * DISC-OFFER-P0-09.1 "Website URL Business Onboarding" -- unlike BusinessProfileSchema
 * above (which only ever populated name/description for the existing "create business
 * from website" flow), this is the doc's own full field list for a founder's first,
 * URL-only onboarding step: every one of the backlog's own seventeen extracted items,
 * each carrying its own provenance rather than a single blanket confidence number.
 *
 * The story's own explicit acceptance criterion -- "Every extracted item must
 * distinguish: Explicitly stated / AI interpretation / Unknown" -- is a per-field
 * property, not a per-profile one (a website can state its name plainly while saying
 * nothing at all about pricing), so every field is one of the two small wrapper shapes
 * below rather than a single top-level confidence score. "Unknown" always means an empty
 * value (null / []), never a guess -- sanitizeWebsiteProfile() (lib/website-onboarding/
 * sanitize.ts) enforces that in code after generation, not just in the prompt, exactly
 * the same "structural enforcement, not just prompt wording" discipline
 * `matchBuyingCommittee()`/`computeBuyerIntelligence()` (06.2/06.3) already established
 * for "do not invent people or roles."
 */
export const WEBSITE_FIELD_STATUS_VALUES = ["explicit", "inferred", "unknown"] as const;
export type WebsiteFieldStatus = (typeof WEBSITE_FIELD_STATUS_VALUES)[number];

export const WebsiteTextFieldSchema = z.object({
  status: z.enum(WEBSITE_FIELD_STATUS_VALUES),
  value: z
    .string()
    .nullable()
    .describe("The extracted text, or null when status is 'unknown' -- never a guess."),
});
export type WebsiteTextField = z.infer<typeof WebsiteTextFieldSchema>;

export const WebsiteListFieldSchema = z.object({
  status: z.enum(WEBSITE_FIELD_STATUS_VALUES),
  items: z
    .array(z.string())
    .describe("The extracted items, or an empty array when status is 'unknown' -- never invented examples."),
});
export type WebsiteListField = z.infer<typeof WebsiteListFieldSchema>;

export const WebsiteBusinessProfileSchema = z.object({
  business_name: WebsiteTextFieldSchema,
  description: WebsiteTextFieldSchema,
  products_or_services: WebsiteListFieldSchema,
  offering_categories: WebsiteListFieldSchema,
  industries_served: WebsiteListFieldSchema,
  customer_types: WebsiteListFieldSchema,
  geographies: WebsiteListFieldSchema,
  value_propositions: WebsiteListFieldSchema,
  use_cases: WebsiteListFieldSchema,
  problems_solved: WebsiteListFieldSchema,
  pricing_hints: WebsiteListFieldSchema,
  case_studies: WebsiteListFieldSchema,
  testimonials: WebsiteListFieldSchema,
  customer_logos: WebsiteListFieldSchema,
  technology_platform: WebsiteListFieldSchema,
  faqs: WebsiteListFieldSchema,
  contact_information: WebsiteTextFieldSchema,
  // Candidate pages for DISC-OFFER-P0-09.2's own crawl to visit next -- "Label — url"
  // strings taken from the links researchWebsite()'s direct-fetch path already preserves
  // inline on the one page fetched this story (no multi-page crawl exists yet, so this
  // is "pages this page links to," not "pages we've visited").
  relevant_pages: WebsiteListFieldSchema,
});
export type WebsiteBusinessProfile = z.infer<typeof WebsiteBusinessProfileSchema>;

/**
 * DISC-OFFER-P0-09.3 "AI Offering Extraction" -- one proposed commercial Offering
 * identified from the crawled website findings (09.2's own combined, page-attributed
 * findings blob), carrying exactly the doc's own field list. Unlike
 * `WebsiteBusinessProfileSchema` above (one flat set of facts about the business as a
 * whole), this is a *list* -- "multiple offerings can be identified" -- and each item
 * carries its own evidence/confidence/source pages rather than one blanket score for the
 * whole extraction, the same "provenance is per-item, not per-call" discipline
 * `WebsiteTextFieldSchema`/`WebsiteListFieldSchema` already established for the business
 * profile.
 *
 * `offeringType` reuses the existing Offering vocabulary (`lib/offerings/types.ts`,
 * DISC-OFFER-P0-01.1) rather than inventing a parallel one -- a proposed offering
 * eventually becomes a real `discovery.products` row (DISC-OFFER-P0-09.4), so its type
 * should already speak that row's own language.
 *
 * `sourcePages` is intentionally a plain string array of URLs (not yet cross-checked
 * against which pages were actually crawled) -- `sanitizeOfferingCandidates()`
 * (lib/website-onboarding/sanitize-offerings.ts) is what drops any URL the model names
 * that isn't one of the pages this run actually fetched, the same "a prompt is a
 * request, not a guarantee, enforce it in code" discipline `sanitizeWebsiteProfile()`
 * already applies to the business profile.
 */
export const WebsiteOfferingCandidateSchema = z.object({
  name: z.string().describe("A short, specific commercial offering name, e.g. 'Managed IAM Services' -- not a single feature."),
  description: z.string().describe("1-3 sentences describing what this offering is and includes."),
  offeringType: z
    .enum(OFFERING_TYPE_VALUES as [string, ...string[]])
    .nullable()
    .describe("Best-fit offering type from the fixed vocabulary, or null if none clearly fits."),
  problemSolved: z.string().nullable().describe("The problem this offering solves for a customer, or null if the findings don't say."),
  targetCustomer: z.string().nullable().describe("Who buys this specific offering (role/org type), or null if the findings don't say."),
  targetIndustry: z.string().nullable().describe("Which industries/verticals this offering is aimed at, or null if the findings don't say."),
  valueProposition: z.string().nullable().describe("Why a customer would choose this offering, or null if the findings don't say."),
  evidence: z
    .string()
    .describe("A short quote or close paraphrase from the findings that supports this offering existing as its own commercial unit."),
  confidence: z.number().min(0).max(1).describe("0-1: how confident this is a real, distinct commercial offering (not a single feature or a guess)."),
  sourcePages: z.array(z.string()).describe("URLs (from the findings' own 'Page: ... (url)' headers) that mention this offering."),
});
export type WebsiteOfferingCandidate = z.infer<typeof WebsiteOfferingCandidateSchema>;

export const WebsiteOfferingExtractionSchema = z.object({
  offerings: z.array(WebsiteOfferingCandidateSchema),
});
export type WebsiteOfferingExtraction = z.infer<typeof WebsiteOfferingExtractionSchema>;
