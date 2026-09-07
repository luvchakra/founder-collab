import { generateObject } from "ai";
import { createClient } from "../../db/server";
import { getProduct, getWorkspaceForProduct } from "../tenancy/queries";
import { listProductKnowledge } from "../knowledge/queries";
import {
  understandProductPrompt,
  UNDERSTAND_PRODUCT_PROMPT_VERSION,
} from "../../prompts/product/understand_product_v1";
import { hashInput } from "./hash";
import { ProductProfileSchema, type ProductProfile } from "./schemas";
import { recordAiRun } from "./usage";
import { assertWithinUsageLimit } from "../usage/limits";
import { hasRecentSuccess } from "./dedup";
import { resolveAiModel, toAiProviderError } from "./router";

const OPERATION = "understand_product";

/**
 * Synthesizes a structured ProductProfile from the workspace's product_knowledge sources.
 *
 * Caching: ai_runs has no result column (blueprint §9), so "cache" here means freshness --
 * if products.product_profile was generated after every current knowledge source's last
 * update, it's returned as-is instead of calling the AI again. Pass { force: true } to
 * regenerate regardless (e.g. a founder-triggered "Regenerate" button).
 */
export async function understandProduct(
  productId: string,
  options: { force?: boolean } = {},
): Promise<ProductProfile> {
  const product = await getProduct(productId);
  if (!product) throw new Error("Product not found.");

  const workspace = await getWorkspaceForProduct(productId);
  if (!workspace) throw new Error("Workspace not found for product.");

  const sources = await listProductKnowledge(workspace.id);

  // The description edited directly on the product page (EditableText, not "Add a file")
  // is real product info too -- without this, a product whose only knowledge source is
  // e.g. a screenshot with no extractable text gets a profile of all "No information
  // provided" even though the page shows a real description right above it. Website is
  // deliberately not included here: it's a bare URL string, not fetched content, so
  // treating it as source material for the model would just be noise.
  const productInfoSource = product.description
    ? [{ source_type: "manual", source_name: "Product info", content: `Description: ${product.description}` }]
    : [];

  const allSources = [...productInfoSource, ...sources];
  if (allSources.length === 0) {
    throw new Error("Add at least one knowledge source before generating a product profile.");
  }

  const latestSourceUpdate = [
    ...(productInfoSource.length > 0 ? [product.updated_at] : []),
    ...sources.map((s) => s.updated_at),
  ].reduce((latest, ts) => (ts > latest ? ts : latest));

  if (
    !options.force &&
    product.product_profile &&
    product.product_profile_generated_at &&
    product.product_profile_generated_at > latestSourceUpdate
  ) {
    return product.product_profile;
  }

  await assertWithinUsageLimit(workspace.id);

  const prompt = understandProductPrompt({
    productName: product.name,
    sources: allSources.map((s) => ({
      sourceType: s.source_type,
      sourceName: s.source_name,
      content: s.content,
    })),
  });

  const { accountId, provider, modelId, model } = await resolveAiModel(workspace.id, OPERATION);
  const inputHash = hashInput({
    prompt,
    version: UNDERSTAND_PRODUCT_PROMPT_VERSION,
    model: modelId,
  });

  // Guards the force-regenerate path specifically -- the freshness check above already
  // covers everything else, but "Regenerate" intentionally bypasses it, so a double-click
  // there would otherwise re-bill for identical input every time.
  if (await hasRecentSuccess(workspace.id, OPERATION, inputHash, undefined, modelId)) {
    if (product.product_profile) return product.product_profile;
  }

  let profile: ProductProfile;
  const startedAt = Date.now();
  try {
    const response = await generateObject({
      model,
      schema: ProductProfileSchema,
      prompt,
    });
    profile = response.object;

    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion: UNDERSTAND_PRODUCT_PROMPT_VERSION,
      inputHash,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: "succeeded",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const aiError = toAiProviderError(error, provider);
    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion: UNDERSTAND_PRODUCT_PROMPT_VERSION,
      inputHash,
      status: "failed",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
      errorCode: aiError.code,
    });
    throw aiError;
  }

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("products")
    .update({
      product_profile: profile,
      product_profile_generated_at: new Date().toISOString(),
    })
    .eq("id", productId);
  if (updateError) throw updateError;

  return profile;
}
