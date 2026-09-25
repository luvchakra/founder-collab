import { UNTRUSTED_RULES, untrusted } from "../shared/untrusted";

export const CONTENT_ASSIST_PROMPT_VERSION = "marketing_content_assist_v1";

export type ContentAssistMode =
  | { mode: "generate"; tone: string }
  | { mode: "rewrite"; style: "shorter" | "clearer" | "more_technical" | "more_executive" | "more_persuasive" | "social" | "email" }
  | { mode: "repurpose"; targetType: string }
  | { mode: "seo" };

const STYLE: Record<string, string> = {
  shorter: "Make it noticeably shorter while keeping every key point.",
  clearer: "Make it clearer and easier to read; simplify sentences and remove jargon.",
  more_technical: "Make it more technical and specific for a technical buyer.",
  more_executive: "Make it concise and outcome-focused for a senior executive.",
  more_persuasive: "Make it more persuasive, with a stronger opening and call to action, without exaggerating.",
  social: "Rewrite it as a LinkedIn/social post.",
  email: "Rewrite it as a short email newsletter.",
};

function task(m: ContentAssistMode, contentType: string): string {
  switch (m.mode) {
    case "generate":
      return `Write a complete ${contentType} from the brief, in a ${m.tone || "clear, professional"} tone. Include a title, the body, a one-paragraph summary, a call to action and suggested SEO title and meta description.`;
    case "rewrite":
      return `Rewrite the existing draft. ${STYLE[m.style] ?? ""} Keep the facts exactly as they are.`;
    case "repurpose":
      return `Repurpose the existing piece into a ${m.targetType}. Keep the facts; change length, structure and voice to suit that format.`;
    case "seo":
      return "Suggest an SEO title (under 60 characters), a meta description (under 155 characters), a heading outline and FAQ questions a searcher might ask. Keep the body unchanged — return it as given. Do not claim any ranking outcome.";
  }
}

/** MKT-09 — generate, rewrite, repurpose or SEO-optimise one piece of content. The result
 * is stored as a new draft version that still needs review and approval. */
export function contentAssistPrompt(input: {
  mode: ContentAssistMode;
  contentType: string;
  title: string;
  brief: string | null;
  body: string | null;
  audience: string | null;
  cta: string | null;
  context: string;
}): string {
  return [
    "You are a marketing writer drafting content for a founder, who will review and edit it before anything is published.",
    UNTRUSTED_RULES,
    "Never state statistics, customer names, results or claims that are not in the material. Where a claim would need proof, phrase it without a number.",
    task(input.mode, input.contentType),
    "",
    `Content type: ${input.contentType}`,
    untrusted("title", input.title),
    untrusted("brief", input.brief),
    untrusted("audience", input.audience),
    untrusted("call_to_action", input.cta),
    untrusted("existing_draft", input.body),
    "",
    "What the business offers:",
    untrusted("discovery_context", input.context),
  ].join("\n");
}
