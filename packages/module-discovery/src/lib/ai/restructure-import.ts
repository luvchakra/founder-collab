import { generateObject } from "ai";
import type { ProspectInput } from "../prospects/mutations";
import {
  restructureImportPrompt,
  RESTRUCTURE_IMPORT_PROMPT_VERSION,
} from "../../prompts/prospecting/restructure_import_v1";
import { hashInput } from "./hash";
import { RestructuredProspectsSchema } from "./schemas";
import { recordAiRun } from "./usage";
import { assertWithinUsageLimit } from "../usage/limits";
import { resolveAiModel, toAiProviderError } from "./router";

const OPERATION = "restructure_import";
const MAX_INPUT_CHARS = 40_000;

/**
 * Maps an uploaded import file's raw content (CSV/Excel text with headers the
 * deterministic parser in lib/prospects/csv.ts didn't recognize, or PDF-extracted text
 * with no structure at all) onto the same `ProspectInput` shape that parser already
 * produces -- the import action's own dedup + insert logic downstream doesn't need to
 * know which path a given row came from. Truncates very large uploads rather than
 * failing outright or risking an oversized/expensive request; a founder importing more
 * than ~40K characters' worth of contacts should use the CSV template instead, which
 * has no such limit since it never touches the AI path.
 */
export async function restructureImportedProspects(
  workspaceId: string,
  rawContent: string,
): Promise<ProspectInput[]> {
  const trimmed = rawContent.trim();
  if (!trimmed) return [];

  await assertWithinUsageLimit(workspaceId);

  const content = trimmed.slice(0, MAX_INPUT_CHARS);
  const prompt = restructureImportPrompt(content);
  const { accountId, provider, modelId, model } = await resolveAiModel(workspaceId, OPERATION);
  const inputHash = hashInput({ prompt, version: RESTRUCTURE_IMPORT_PROMPT_VERSION, model: modelId });

  const startedAt = Date.now();
  try {
    const response = await generateObject({
      model,
      schema: RestructuredProspectsSchema,
      prompt,
    });

    await recordAiRun({
      workspaceId,
      operation: OPERATION,
      model: modelId,
      promptVersion: RESTRUCTURE_IMPORT_PROMPT_VERSION,
      inputHash,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: "succeeded",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
    });

    return response.object.prospects
      .filter((p) => p.company_name.trim().length > 0)
      .map((p) => ({
        companyName: p.company_name.trim(),
        website: p.website?.trim() || undefined,
        industry: p.industry?.trim() || undefined,
        companySize: p.company_size?.trim() || undefined,
        location: p.location?.trim() || undefined,
        description: p.description?.trim() || undefined,
      }));
  } catch (error) {
    const aiError = toAiProviderError(error, provider);
    await recordAiRun({
      workspaceId,
      operation: OPERATION,
      model: modelId,
      promptVersion: RESTRUCTURE_IMPORT_PROMPT_VERSION,
      inputHash,
      status: "failed",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
      errorCode: aiError.code,
    });
    throw aiError;
  }
}
