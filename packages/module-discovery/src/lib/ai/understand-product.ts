import { generateObject, generateText } from "ai";
import { createClient } from "../../db/server";
import { getProduct, getWorkspaceForProduct } from "../tenancy/queries";
import { listProductKnowledge } from "../knowledge/queries";
import { understandProductPrompt } from "../../prompts/product/understand_product_v1";
import {
  researchProductWebsitePrompt,
  RESEARCH_PRODUCT_WEBSITE_PROMPT_VERSION,
} from "../../prompts/product/research_product_website_v1";
import { hashInput } from "./hash";
import { ProductProfileSchema, type ProductProfile } from "./schemas";
import { recordAiRun } from "./usage";
import { assertWithinUsageLimit } from "../usage/limits";
import { hasRecentSuccess } from "./dedup";
import { resolveAiModel, toAiProviderError, AiProviderError } from "./router";
import { createUrlContextTools } from "@cofounderai/core/ai/provider-factory";

const OPERATION = "understand_product";

/**
 * Synthesizes a structured ProductProfile by researching the product's own website via a
 * provider-executed tool that actually retrieves that one URL (createUrlContextTools --
 * Gemini's dedicated url_context tool for Google, the same web_search tool OpenAI/
 * Anthropic already use to fetch specific URLs otherwise), then structuring those
 * findings (plus the product's description and any product_knowledge sources) into
 * ProductProfileSchema. The website is a hard requirement -- there's nothing to research
 * without one.
 *
 * Caching: ai_runs has no result column (blueprint §9), so "cache" here means freshness --
 * if products.product_profile was generated after the website/description/every current
 * knowledge source's last update, it's returned as-is instead of researching again. Pass
 * { force: true } to regenerate regardless (e.g. a founder-triggered "Regenerate" click).
 */
export async function understandProduct(
  productId: string,
  options: { force?: boolean } = {},
): Promise<ProductProfile> {
  const product = await getProduct(productId);
  if (!product) throw new Error("Product not found.");
  if (!product.website) {
    throw new Error("Add a website before generating a product profile.");
  }

  const workspace = await getWorkspaceForProduct(productId);
  if (!workspace) throw new Error("Workspace not found for product.");

  const sources = await listProductKnowledge(workspace.id);

  const latestUpdate = [product.updated_at, ...sources.map((s) => s.updated_at)].reduce(
    (latest, ts) => (ts > latest ? ts : latest),
  );

  if (
    !options.force &&
    product.product_profile &&
    product.product_profile_generated_at &&
    product.product_profile_generated_at > latestUpdate
  ) {
    return product.product_profile;
  }

  await assertWithinUsageLimit(workspace.id);

  const { accountId, provider, modelId, model, modelAtTier } = await resolveAiModel(
    workspace.id,
    OPERATION,
  );

  const researchPrompt = researchProductWebsitePrompt({
    productName: product.name,
    website: product.website,
  });
  const inputHash = hashInput({
    researchPrompt,
    version: RESEARCH_PRODUCT_WEBSITE_PROMPT_VERSION,
    model: modelId,
  });

  // Guards the force-regenerate path specifically -- the freshness check above already
  // covers everything else, but "Regenerate" intentionally bypasses it, so a double-click
  // there would otherwise re-run the most expensive step (web search) twice for the same
  // input.
  if (await hasRecentSuccess(workspace.id, OPERATION, inputHash, undefined, modelId)) {
    if (product.product_profile) return product.product_profile;
  }

  let profile: ProductProfile;
  const startedAt = Date.now();
  try {
    const searchResponse = await generateText({
      model,
      tools: createUrlContextTools(provider),
      prompt: researchPrompt,
    });

    // Gemini reports per-URL retrieval status on urlContextMetadata (not available for
    // OpenAI/Anthropic, whose web_search tool has no equivalent structured status) --
    // logged unconditionally during development so a retrieval failure is diagnosable
    // from Vercel function logs instead of only showing up as "no findings" below.
    const googleMetadata = searchResponse.providerMetadata?.google as unknown as
      | { urlContextMetadata?: { urlMetadata?: { retrievedUrl: string; urlRetrievalStatus: string }[] } }
      | undefined;
    const urlMetadata = googleMetadata?.urlContextMetadata?.urlMetadata;
    if (urlMetadata) {
      console.log(
        `[ai/understand-product] Gemini url_context retrieval for ${product.website}:`,
        JSON.stringify(urlMetadata),
      );
      const failed = urlMetadata.find((entry) => entry.urlRetrievalStatus !== "URL_RETRIEVAL_STATUS_SUCCESS");
      if (failed) {
        throw new AiProviderError(
          "url_retrieval_failed",
          `Gemini could not retrieve ${failed.retrievedUrl} (status: ${failed.urlRetrievalStatus}). The site may be blocking automated access, redirecting, or returning an error -- check it loads without a login and isn't behind a WAF/CDN challenge.`,
          provider,
        );
      }
    }
    console.log(
      `[ai/understand-product] raw findings for ${product.website} (${searchResponse.text.length} chars):`,
      searchResponse.text.slice(0, 2000),
    );

    const findings = searchResponse.text.trim();
    if (!findings) {
      throw new AiProviderError(
        "no_content_found",
        `${provider} retrieved ${product.website} but found no useful product information there. The page's content may only render after client-side JavaScript runs, or it may not describe the product -- add details manually as a knowledge source instead.`,
        provider,
      );
    }

    const structurePrompt = understandProductPrompt({
      productName: product.name,
      sources: [
        { sourceType: "website", sourceName: product.website, content: findings },
        ...(product.description
          ? [{ sourceType: "manual", sourceName: "Product info", content: `Description: ${product.description}` }]
          : []),
        ...sources.map((s) => ({
          sourceType: s.source_type,
          sourceName: s.source_name,
          content: s.content,
        })),
      ],
    });

    const structureResponse = await generateObject({
      model: modelAtTier("fast"),
      schema: ProductProfileSchema,
      prompt: structurePrompt,
    });
    profile = structureResponse.object;

    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion: RESEARCH_PRODUCT_WEBSITE_PROMPT_VERSION,
      inputHash,
      inputTokens: (searchResponse.usage.inputTokens ?? 0) + (structureResponse.usage.inputTokens ?? 0),
      outputTokens: (searchResponse.usage.outputTokens ?? 0) + (structureResponse.usage.outputTokens ?? 0),
      searchCount: searchResponse.toolCalls.length,
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
      promptVersion: RESEARCH_PRODUCT_WEBSITE_PROMPT_VERSION,
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
