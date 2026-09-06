import { z } from "zod";

/**
 * Structured product understanding output (blueprint §12, §17). Every field must be
 * traceable to the source material the model was given -- see
 * prompts/product/understand_product_v1.ts for the anti-hallucination instructions.
 */
export const ProductProfileSchema = z.object({
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
      "One natural follow-up question the founder might ask next, given this context " +
        "and conversation so far. A short, complete question.",
    ),
});

export type ChatResponse = z.infer<typeof ChatResponseSchema>;
