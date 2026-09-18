import { generateObject } from "ai";
import { z } from "zod";
import { createAdminClient } from "../db/admin";
import { hashInput } from "../ai/hash";
import { getPlatformAiCredential } from "../ai/platform-credential";
import { resolveModelId } from "../ai/model-registry";
import { getOperationSpec } from "../ai/operation-registry";
import { createLanguageModel } from "../ai/provider-factory";
import { searchHelp } from "./search";
import { sectionHref } from "./types";

/**
 * The Get Help assistant: answers a question about WonderArk from WonderArk's own user
 * guides, and links to the sections it used.
 *
 * Three decisions worth stating, because each is a place this could have been built worse:
 *
 * 1. **Retrieval is deterministic, the model only writes.** `searchHelp` picks the
 *    sections; the model is handed those sections and told to answer from them. That
 *    keeps the expensive, unpredictable part to the one job it is actually better at, and
 *    means an answer's sources are known before the model ever runs — the links are real
 *    by construction, not something the model claims.
 *
 * 2. **It runs on the platform's own AI key, never the founder's.** The subject is our
 *    documentation, identical for every tenant. Billing a founder's BYOK key to explain
 *    our own product would be wrong, and it would make the answer uncacheable across
 *    tenants for no reason.
 *
 * 3. **No key configured is not an error.** Without an AI credential the assistant still
 *    answers with the sections retrieval found — that is genuinely most of the value, and
 *    a help page that breaks when the help is what you needed is the worst possible
 *    failure. The result says which mode produced it so the UI can be honest about it.
 */

/** Bumped whenever the instructions below change, so answers written under the old ones
 * stop being served rather than being mixed in with the new. */
const PROMPT_VERSION = "help-assistant-1";

/** Enough context to answer without burning the model's attention on the whole manual. */
const MAX_SECTIONS = 4;
/** A question longer than this is a paste, not a question. */
const MAX_QUESTION_LENGTH = 500;

export type HelpSource = {
  guideSlug: string;
  guideTitle: string;
  sectionId: string;
  heading: string;
  href: string;
};

export type HelpAnswer = {
  answer: string;
  sources: HelpSource[];
  /** "assistant" -- a model wrote the answer. "sections" -- no AI credential is
   * configured, so these are the sections that match, with no prose. "unknown" -- nothing
   * in the guides matches the question at all. */
  mode: "assistant" | "sections" | "unknown";
  /** True when this exact question, against this exact documentation, was answered before. */
  cached: boolean;
};

const AnswerSchema = z.object({
  answer: z
    .string()
    .describe("The answer, in 1-4 short sentences of plain prose. No markdown headings."),
  usedSectionIds: z
    .array(z.string())
    .describe("The ids of the provided sections the answer actually drew on."),
  answered: z
    .boolean()
    .describe("False when the provided sections do not contain the answer."),
});

function toSource(section: { guideSlug: string; guideTitle: string; sectionId: string; heading: string }): HelpSource {
  return {
    guideSlug: section.guideSlug,
    guideTitle: section.guideTitle,
    sectionId: section.sectionId,
    heading: section.heading,
    href: sectionHref(section.guideSlug, section.sectionId),
  };
}

/** Normalised so "How do I close a period?" and "how do i close a period" are one cache
 * entry rather than two. */
function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ").replace(/[?!.]+$/, "");
}

type CacheRow = { answer: string; sources: HelpSource[] };

async function readCache(questionHash: string): Promise<CacheRow | null> {
  try {
    const supabase = createAdminClient({ schema: "platform" });
    const { data, error } = await supabase
      .from("help_answers")
      .select("answer, sources")
      .eq("prompt_version", PROMPT_VERSION)
      .eq("question_hash", questionHash)
      .maybeSingle();
    if (error) throw error;
    return data ? { answer: data.answer, sources: (data.sources ?? []) as HelpSource[] } : null;
  } catch (cause) {
    // A cache that cannot be read is a slower answer, not a failed one.
    console.warn("[help] Could not read the answer cache.", cause);
    return null;
  }
}

async function writeCache(row: {
  questionHash: string;
  question: string;
  answer: string;
  sources: HelpSource[];
  provider: string;
  model: string;
}): Promise<void> {
  try {
    const supabase = createAdminClient({ schema: "platform" });
    const { error } = await supabase.from("help_answers").upsert(
      {
        prompt_version: PROMPT_VERSION,
        question_hash: row.questionHash,
        question: row.question,
        answer: row.answer,
        sources: row.sources,
        provider: row.provider,
        model: row.model,
      },
      { onConflict: "prompt_version,question_hash" },
    );
    if (error) throw error;
  } catch (cause) {
    console.warn("[help] Could not write the answer cache.", cause);
  }
}

export async function answerHelpQuestion(rawQuestion: string): Promise<HelpAnswer> {
  const question = rawQuestion.trim().slice(0, MAX_QUESTION_LENGTH);
  const matches = searchHelp(question, MAX_SECTIONS);

  if (matches.length === 0) {
    return {
      answer:
        "I couldn't find anything in the user guides about that. Try different words, or browse the guides below — and if it's something WonderArk doesn't do yet, the guides won't cover it.",
      sources: [],
      mode: "unknown",
      cached: false,
    };
  }

  const sources = matches.map(toSource);

  // The cache key covers the retrieved sections' own text, so editing a guide invalidates
  // every answer drawn from it -- no expiry to tune, and no answer that quotes
  // documentation which no longer says that.
  const questionHash = hashInput({
    question: normalizeQuestion(question),
    sections: matches.map((section) => ({ id: section.sectionId, body: section.body })),
  });

  const cached = await readCache(questionHash);
  if (cached) {
    return { answer: cached.answer, sources: cached.sources, mode: "assistant", cached: true };
  }

  const credential = await getPlatformAiCredential();
  if (!credential) {
    return {
      answer:
        "The AI assistant isn't configured on this deployment, so I can't write an answer — but these sections of the guides look like the right ones for your question.",
      sources,
      mode: "sections",
      cached: false,
    };
  }

  const spec = getOperationSpec("answer_help_question");
  const modelId = resolveModelId(credential.provider, spec.qualityTier);
  const model = createLanguageModel(credential.provider, credential.apiKey, modelId);

  const context = matches
    .map(
      (section) =>
        `<section id="${section.sectionId}" guide="${section.guideTitle}">\n# ${section.heading}\n\n${section.body}\n</section>`,
    )
    .join("\n\n");

  try {
    const { object } = await generateObject({
      model,
      schema: AnswerSchema,
      system: [
        "You answer questions about WonderArk, a business platform, for the people who use it.",
        "You are given sections of WonderArk's own user guides. Answer ONLY from those sections.",
        "If they do not contain the answer, set answered to false and say briefly what you could not find. Never guess, and never describe a feature the sections do not mention.",
        "Be direct and concrete: name the screen or the button. Two to four short sentences, plain prose, no headings and no bullet lists.",
        "Do not include links — the interface shows the source sections alongside your answer.",
        "Write to the person using the product, not about them.",
      ].join(" "),
      prompt: `Question: ${question}\n\nGuide sections:\n\n${context}`,
    });

    // Sections the model says it used come first; the rest still show, because a section
    // retrieval ranked highly is worth offering even when the answer didn't quote it.
    const used = new Set(object.usedSectionIds);
    const ordered = [
      ...sources.filter((source) => used.has(source.sectionId)),
      ...sources.filter((source) => !used.has(source.sectionId)),
    ];

    if (!object.answered) {
      return { answer: object.answer, sources: ordered, mode: "sections", cached: false };
    }

    await writeCache({
      questionHash,
      question: question,
      answer: object.answer,
      sources: ordered,
      provider: credential.provider,
      model: modelId,
    });

    return { answer: object.answer, sources: ordered, mode: "assistant", cached: false };
  } catch (cause) {
    // The retrieval already succeeded, so there is a genuinely useful answer to give even
    // though the model call failed. Degrade to it rather than showing an error.
    console.error("[help] The assistant could not write an answer.", cause);
    return {
      answer:
        "I couldn't reach the AI assistant just now, but these sections of the guides look like the right ones for your question.",
      sources,
      mode: "sections",
      cached: false,
    };
  }
}
