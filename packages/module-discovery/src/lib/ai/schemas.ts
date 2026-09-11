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
});

export type IcpProfileDraft = z.infer<typeof IcpProfileSchema>;

/**
 * Evidence model (blueprint §33): every claim distinguishes FACT / INFERENCE / ASSUMPTION
 * / UNKNOWN rather than being asserted flatly. Used by prospect research.
 */
export const EvidenceItemSchema = z.object({
  claim: z.string(),
  source_url: z.string().nullable().describe("URL where this was found, or null"),
  confidence: z.enum(["fact", "inference", "assumption", "unknown"]),
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
