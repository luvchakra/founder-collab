import { generateObject, generateText } from "ai";
import { getBusiness, getFirstWorkspaceForAccount, getFirstWorkspaceForBusiness } from "../tenancy/queries";
import {
  researchProductCatalogPrompt,
  structureProductCatalogPrompt,
  DISCOVER_PRODUCTS_PROMPT_VERSION,
} from "../../prompts/tenancy/discover_products_v1";
import { hashInput } from "./hash";
import { DiscoveredProductsSchema, type DiscoveredProduct } from "./schemas";
import { recordAiRun } from "./usage";
import { assertWithinUsageLimit } from "../usage/limits";
import { resolveAiModel, toAiProviderError, AiProviderError } from "./router";
import { createUrlContextTools } from "@cofounderai/core/ai/provider-factory";

const OPERATION = "discover_products";

/**
 * "Let AI Auto-populate Products from website" (item #10/#12 of a UX pass) -- same
 * research-then-structure shape as understandProduct() (that file's own doc comment
 * explains why: a provider-executed tool that actually retrieves the URL, then a
 * separate structuring call), scoped to the business's own website rather than one
 * product's. Deliberately returns just name + website per the actual ask ("just get
 * the product name and product specific website link") -- callers create the rows
 * (createProductsBulk, the same bulk-insert the CSV/Excel import path already uses)
 * and a full profile is generated per-product afterward via the existing
 * understandProduct() once each one exists as a real product with its own workspace.
 *
 * ai_runs/usage-limit tracking is workspace-scoped (D-5/BYOK's own design, not
 * something this function can change) -- but a business with no products yet has no
 * workspace of its own, which is exactly the common case this feature targets (the
 * *first* products). Falls back to the account's first workspace across any business
 * for attribution purposes only, same fallback getChatPanelData's own resolveChatContext
 * uses for the same underlying reason; if the account genuinely has no workspace
 * anywhere yet, there's nothing to attribute usage to and this says so rather than
 * silently picking something arbitrary.
 */
export async function discoverProductsFromWebsite(businessId: string): Promise<DiscoveredProduct[]> {
  const business = await getBusiness(businessId);
  if (!business) throw new Error("Business not found.");
  if (!business.website) {
    throw new Error("Add a website for this business before using AI auto-populate.");
  }

  const workspace = (await getFirstWorkspaceForBusiness(businessId)) ?? (await getFirstWorkspaceForAccount(business.account_id));
  if (!workspace) {
    throw new Error("Create at least one product manually first -- AI auto-populate needs an existing product to track usage against.");
  }

  await assertWithinUsageLimit(workspace.id);

  const { accountId, provider, modelId, model, modelAtTier } = await resolveAiModel(workspace.id, OPERATION);

  const researchPrompt = researchProductCatalogPrompt({ businessName: business.name, website: business.website });
  const inputHash = hashInput({ researchPrompt, version: DISCOVER_PRODUCTS_PROMPT_VERSION, model: modelId });

  let products: DiscoveredProduct[];
  const startedAt = Date.now();
  try {
    const searchResponse = await generateText({
      model,
      tools: createUrlContextTools(provider),
      prompt: researchPrompt,
    });

    // Same Gemini-specific retrieval-status check as understandProduct() -- see that
    // file's own comment for why this is worth surfacing as a specific, actionable
    // error rather than letting a blocked/redirected fetch read as "no products found."
    const googleMetadata = searchResponse.providerMetadata?.google as unknown as
      | { urlContextMetadata?: { urlMetadata?: { retrievedUrl: string; urlRetrievalStatus: string }[] } }
      | undefined;
    const urlMetadata = googleMetadata?.urlContextMetadata?.urlMetadata;
    if (urlMetadata) {
      const failed = urlMetadata.find((entry) => entry.urlRetrievalStatus !== "URL_RETRIEVAL_STATUS_SUCCESS");
      if (failed) {
        throw new AiProviderError(
          "url_retrieval_failed",
          `Gemini could not retrieve ${failed.retrievedUrl} (status: ${failed.urlRetrievalStatus}). The site may be blocking automated access, redirecting, or returning an error -- check it loads without a login and isn't behind a WAF/CDN challenge.`,
          provider,
        );
      }
    }

    const findings = searchResponse.text.trim();
    if (!findings) {
      throw new AiProviderError(
        "no_content_found",
        `${provider} retrieved ${business.website} but found no useful product information there. The page's content may only render after client-side JavaScript runs -- add products manually instead.`,
        provider,
      );
    }

    const structureResponse = await generateObject({
      model: modelAtTier("fast"),
      schema: DiscoveredProductsSchema,
      prompt: structureProductCatalogPrompt({ businessName: business.name, findings }),
    });
    products = structureResponse.object.products;

    await recordAiRun({
      workspaceId: workspace.id,
      operation: OPERATION,
      model: modelId,
      promptVersion: DISCOVER_PRODUCTS_PROMPT_VERSION,
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
      promptVersion: DISCOVER_PRODUCTS_PROMPT_VERSION,
      inputHash,
      status: "failed",
      accountId,
      provider,
      durationMs: Date.now() - startedAt,
      errorCode: aiError.code,
    });
    throw aiError;
  }

  if (products.length === 0) {
    throw new Error(`No distinct products or services were found on ${business.website}. Add products manually instead.`);
  }

  return products;
}
