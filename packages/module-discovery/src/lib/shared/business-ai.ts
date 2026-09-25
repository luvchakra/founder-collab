import { generateObject, generateText } from "ai";
import type { z } from "zod";
import { hashInput } from "@cofounderai/core/ai/hash";
import { recordAiRun } from "@cofounderai/core/ai-usage/mutations";
import { createWebSearchTools } from "@cofounderai/core/ai/provider-factory";
import { resolveBusinessAiModel, toAiProviderError } from "@cofounderai/core/ai/business-router";
import type { AiOperation } from "@cofounderai/core/ai/operation-registry";

/**
 * One structured, business-scoped AI call for Discovery's Marketing and Funding drafts
 * (MKT-04/09, FND-08/11/13). The same discipline as every other AI call here, in one
 * place: resolve the model through the shared business router, validate the output with
 * Zod (an invalid response is a typed `invalid_response` error, never stored), and record
 * the run — success or failure — in `core.ai_runs` with its prompt version and input hash.
 *
 * `research` adds a first, web-search step whose text is then structured by the second
 * call; the search results are untrusted and must be fenced by the structuring prompt.
 */
export async function runBusinessAi<T>(input: {
  businessId: string;
  operation: AiOperation;
  promptVersion: string;
  prompt: string;
  schema: z.ZodType<T>;
  research?: { prompt: string; toStructurePrompt: (findings: string) => string };
}): Promise<{ object: T; inputHash: string; model: string }> {
  const { provider, modelId, model } = await resolveBusinessAiModel(input.businessId, input.operation);
  // Keyed on what was asked, not which model answered, so a cached draft is reused even
  // after the business switches provider.
  const inputHash = businessAiInputHash(input.research?.prompt ?? input.prompt, input.promptVersion);
  const startedAt = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let searchCount = 0;
  try {
    let prompt = input.prompt;
    if (input.research) {
      const search = await generateText({ model, tools: createWebSearchTools(provider), prompt: input.research.prompt });
      inputTokens += search.usage.inputTokens ?? 0;
      outputTokens += search.usage.outputTokens ?? 0;
      searchCount = search.toolCalls.length;
      prompt = input.research.toStructurePrompt(search.text.trim());
    }
    const response = await generateObject({ model, schema: input.schema, prompt });
    inputTokens += response.usage.inputTokens ?? 0;
    outputTokens += response.usage.outputTokens ?? 0;
    await recordAiRun({
      businessId: input.businessId,
      operation: input.operation,
      model: modelId,
      provider,
      promptVersion: input.promptVersion,
      inputHash,
      inputTokens,
      outputTokens,
      searchCount,
      durationMs: Date.now() - startedAt,
      status: "succeeded",
    });
    return { object: response.object as T, inputHash, model: modelId };
  } catch (error) {
    const aiError = toAiProviderError(error, provider);
    await recordAiRun({
      businessId: input.businessId,
      operation: input.operation,
      model: modelId,
      provider,
      promptVersion: input.promptVersion,
      inputHash,
      durationMs: Date.now() - startedAt,
      status: "failed",
      errorCode: aiError.code,
    }).catch(() => undefined);
    throw aiError;
  }
}

/** The input hash `runBusinessAi` would compute, for a cache lookup before calling. */
export function businessAiInputHash(prompt: string, promptVersion: string): string {
  return hashInput({ prompt, version: promptVersion });
}
