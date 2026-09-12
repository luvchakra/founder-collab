import { generateObject } from "ai";
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
import { resolveAiModel, toAiProviderError } from "./router";
import { createUrlContextTools } from "@cofounderai/core/ai/provider-factory";
import { crawlWebsite } from "./website-crawl";

const OPERATION = "understand_product";

/**
 * Synthesizes a structured ProductProfile by researching the product's own website via
 * researchWebsite() (provider-executed URL retrieval, falling back to a direct
 * server-side fetch if the provider's own crawler is blocked), then structuring those
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
    // DISC-OFFER-P0-12.1: "Offering-Specific Website Research" -- a multi-page crawl
    // (DISC-OFFER-P0-09.2's own `crawlWebsite`, previously only used for whole-business
    // onboarding) instead of a single-page fetch, so an offering whose own details are
    // spread across e.g. /services, /pricing, /case-studies is actually read in full, not
    // just its root URL. Every page -- home and every crawled page alike -- is asked
    // about *this offering by name* (`researchProductWebsitePrompt`, unchanged from
    // before this story) rather than the crawl's own generic "what does this business do"
    // default, so a site describing several different offerings gets read with this one
    // in mind. "Do not repeatedly process irrelevant pages" is `crawlWebsite`'s own
    // already-built dedup/cap/category machinery, inherited for free.
    const research = await crawlWebsite(
      product.website,
      model,
      createUrlContextTools(provider),
      provider,
      undefined,
      undefined,
      (url) => researchProductWebsitePrompt({ productName: product.name, website: url }),
    );
    console.log(
      `[ai/understand-product] crawled ${research.pages.length} page(s) for ${product.website} (${research.combinedFindings.length} chars combined)`,
    );

    const structurePrompt = understandProductPrompt({
      productName: product.name,
      sources: [
        { sourceType: "website", sourceName: product.website, content: research.combinedFindings },
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
      inputTokens: research.usage.inputTokens + (structureResponse.usage.inputTokens ?? 0),
      outputTokens: research.usage.outputTokens + (structureResponse.usage.outputTokens ?? 0),
      searchCount: research.usage.searchCount,
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
      // Auto-fills the product's own description from the research, but only when the
      // founder hasn't written one themselves -- "auto-populate" should fill gaps, not
      // silently overwrite something they typed.
      ...(product.description ? {} : { description: profile.description }),
    })
    .eq("id", productId);
  if (updateError) throw updateError;

  return profile;
}
