import { z } from "zod";
import { generateObject } from "ai";
import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { encryptApiKey } from "@cofounderai/core/crypto/api-key";
import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { hashInput } from "@cofounderai/core/ai/hash";
import { recordAiRun } from "@cofounderai/core/ai-usage/mutations";
import { resolveBusinessAiModel, toAiProviderError } from "@cofounderai/core/ai/business-router";
import { createClient } from "../../db/server";
import { getBusiness } from "../tenancy/queries";
import { getChannelConnection, getDecryptedAccessToken } from "../channel-connections/queries";
import {
  listAllGoogleBusinessProfileReviews,
  publishGoogleBusinessProfileReviewReply,
  verifyGoogleBusinessProfileLocation,
} from "./google-business-profile-adapter";
import type { ReviewItem, ReviewItemStatus } from "./types";

/**
 * CRM-08.5's connect flow, same shape as `channel-connections/mutations.ts#connectWhatsApp`:
 * verifies the location + token actually work (a real `reviews.list` call) before ever
 * storing anything. `accountId`/`locationId` are the two path segments Google's own
 * location picker (or a manual paste of the location's resource name) hands back --
 * stored joined as `accounts/{accountId}/locations/{locationId}` in
 * `external_account_id` so the adapter never has to reassemble it.
 */
export async function connectGoogleBusinessProfileLocation(
  businessId: string,
  input: { accountId: string; locationId: string; accessToken: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "channel_connections.manage");

  const locationName = `accounts/${input.accountId}/locations/${input.locationId}`;
  const check = await verifyGoogleBusinessProfileLocation({ locationName, accessToken: input.accessToken });
  if (!check.ok) return { ok: false, error: check.detail ?? "This Google Business Profile location could not be verified." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("channel_connection")
    .upsert(
      {
        business_id: businessId,
        channel: "google_business_profile",
        provider: "google_business_profile",
        external_account_id: locationName,
        access_token_encrypted: encryptApiKey(input.accessToken),
        status: "connected",
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "business_id,channel,provider,external_account_id" },
    )
    .select("id")
    .single();
  if (error) throw error;

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_channel_connection.connected",
    entityType: "crm_channel_connection",
    entityId: data.id,
    after: { channel: "google_business_profile", external_account_id: locationName, status: "connected" },
  });

  return { ok: true };
}

/**
 * CRM-08.5's "reviews can be listed for connected locations": pulls every review for one
 * connection right now and upserts `crm.review_item` (unique on `business_id, provider,
 * external_review_id`, CRM-01.2's own idempotency key -- a re-sync never duplicates a
 * review). Deliberately never downgrades a human's own workflow choice
 * (`in_progress`/`dismissed`) back to `new`/`responded` just because the provider's
 * reply state disagrees -- same "a system-detected signal never overrides a human's own
 * explicit action" rule `channel-connections/mutations.ts#applyChannelConnectionHealthResult`
 * already applies to connection status. The only status this function ever *sets* is the
 * initial `new`/`responded` split on first sight, or bumping a still-`new` review to
 * `responded` once the provider shows a reply -- reflecting reality without ever erasing
 * a person's own triage.
 */
export async function syncGoogleBusinessProfileReviews(businessId: string, connectionId: string): Promise<{ synced: number }> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "channel_connections.manage");

  const connection = await getChannelConnection(businessId, connectionId);
  if (!connection || connection.channel !== "google_business_profile") throw new Error("This Google Business Profile connection could not be found.");

  const accessToken = await getDecryptedAccessToken(businessId, connectionId);
  if (!accessToken) throw new Error("This connection has no access token on file -- reconnect it first.");

  const result = await listAllGoogleBusinessProfileReviews({ locationName: connection.external_account_id, accessToken });
  if (!result.ok) throw new Error(result.detail);

  const supabase = await createClient();
  const externalReviewIds = result.reviews.map((r) => r.externalReviewId);
  const { data: existingRows, error: existingError } =
    externalReviewIds.length > 0
      ? await supabase.from("review_item").select("external_review_id, status").eq("business_id", businessId).eq("provider", "google_business_profile").in("external_review_id", externalReviewIds)
      : { data: [] as { external_review_id: string; status: ReviewItemStatus }[], error: null };
  if (existingError) throw existingError;
  const existingStatusByExternalId = new Map((existingRows ?? []).map((row) => [row.external_review_id, row.status]));

  if (result.reviews.length === 0) return { synced: 0 };

  const rows = result.reviews.map((review) => {
    const existingStatus = existingStatusByExternalId.get(review.externalReviewId);
    const status: ReviewItemStatus = existingStatus && existingStatus !== "new" ? existingStatus : review.hasReply ? "responded" : "new";
    return {
      business_id: businessId,
      channel_connection_id: connectionId,
      provider: "google_business_profile",
      external_review_id: review.externalReviewId,
      rating: review.rating,
      comment_excerpt: review.commentExcerpt,
      reviewer_name: review.reviewerName,
      occurred_at: review.occurredAt,
      status,
    };
  });

  const { error: upsertError } = await supabase.from("review_item").upsert(rows, { onConflict: "business_id,provider,external_review_id" });
  if (upsertError) throw upsertError;

  await supabase.from("channel_connection").update({ last_synced_at: new Date().toISOString() }).eq("id", connectionId).eq("business_id", businessId);

  return { synced: rows.length };
}

const DRAFT_REVIEW_RESPONSE_PROMPT_VERSION = "v1";
const OPERATION = "draft_review_response";
const DraftReplySchema = z.object({ draftReply: z.string().min(1) });

function draftReviewResponsePrompt(input: { businessName: string; rating: number | null; comment: string | null; reviewerName: string | null }): string {
  return [
    `You are drafting a short, professional reply from "${input.businessName}" to a public Google Business Profile review.`,
    `Reviewer: ${input.reviewerName ?? "Anonymous"}`,
    `Rating: ${input.rating != null ? `${input.rating} out of 5 stars` : "not given"}`,
    `Review text: ${input.comment ?? "(no written comment)"}`,
    "",
    "Write a warm, specific, on-brand reply of 2-4 sentences. Thank the reviewer by name only if a real name was given.",
    "For a low rating (1-3 stars) or a complaint, acknowledge the issue genuinely and invite them to reach out directly to make it right -- do not promise a specific compensation, refund, or resolution.",
    "For a high rating (4-5 stars), thank them warmly and invite them back, without sounding generic or robotic.",
    "Do not invent facts about the business, the reviewer, or what happened. Return only the reply text.",
  ].join("\n");
}

/**
 * CRM-08.6's "AI drafts response" -- the first call from module-crm (or any non-
 * discovery module) through `@cofounderai/core/ai/business-router`'s `business_id`-
 * scoped credential resolution, per the root CLAUDE.md's AI rule ("called only through
 * a lib/ai-equivalent inside packages/core or module-discovery"). Only ever writes
 * `draft_reply` -- never calls Google, never changes anything a person hasn't approved
 * (see `publishReviewResponse()` below for the actual publish step, gated separately).
 *
 * Caches on the entity itself rather than re-deriving from `core.ai_runs` (CLAUDE.md
 * principle 5, "cache all repeatable AI operations"): if the review's own rating/
 * comment/reviewer haven't changed since the last draft, `draft_input_hash` already
 * matches and this returns the stored draft without a second AI call -- the same "don't
 * re-run the most expensive operation for the same input" reasoning
 * `research-prospect.ts#hasRecentSuccess` already established, simplified since the
 * hash lives on the row itself rather than needing a separate ai_runs lookup.
 */
export async function draftReviewResponse(businessId: string, reviewId: string): Promise<{ draftReply: string }> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "reviews.publish");

  const supabase = await createClient();
  const { data: review, error: reviewError } = await supabase.from("review_item").select("*").eq("id", reviewId).eq("business_id", businessId).maybeSingle();
  if (reviewError) throw reviewError;
  if (!review) throw new Error("This review could not be found.");
  const reviewRow = review as ReviewItem;

  const business = await getBusiness(businessId);
  if (!business) throw new Error("Business not found.");

  const prompt = draftReviewResponsePrompt({
    businessName: business.name,
    rating: reviewRow.rating,
    comment: reviewRow.comment_excerpt,
    reviewerName: reviewRow.reviewer_name,
  });
  const inputHash = hashInput({ prompt, version: DRAFT_REVIEW_RESPONSE_PROMPT_VERSION });

  if (reviewRow.draft_reply && reviewRow.draft_input_hash === inputHash) {
    return { draftReply: reviewRow.draft_reply };
  }

  const { businessId: resolvedBusinessId, provider, modelId, model } = await resolveBusinessAiModel(businessId, OPERATION);
  const startedAt = Date.now();
  try {
    const response = await generateObject({ model, schema: DraftReplySchema, prompt });

    await recordAiRun({
      businessId: resolvedBusinessId,
      operation: OPERATION,
      model: modelId,
      provider,
      promptVersion: DRAFT_REVIEW_RESPONSE_PROMPT_VERSION,
      inputHash,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      status: "succeeded",
      durationMs: Date.now() - startedAt,
    });

    const draftReply = response.object.draftReply;
    const { error: updateError } = await supabase
      .from("review_item")
      .update({
        draft_reply: draftReply,
        draft_input_hash: inputHash,
        draft_generated_at: new Date().toISOString(),
        status: reviewRow.status === "new" ? "in_progress" : reviewRow.status,
      })
      .eq("id", reviewId)
      .eq("business_id", businessId);
    if (updateError) throw updateError;

    return { draftReply };
  } catch (error) {
    const aiError = toAiProviderError(error, provider);
    await recordAiRun({
      businessId: resolvedBusinessId,
      operation: OPERATION,
      model: modelId,
      provider,
      promptVersion: DRAFT_REVIEW_RESPONSE_PROMPT_VERSION,
      inputHash,
      status: "failed",
      durationMs: Date.now() - startedAt,
      errorCode: aiError.code,
    });
    throw aiError;
  }
}

/**
 * CRM-08.6's own publish step -- the point the story's acceptance criteria actually
 * gate on human approval: the text published is whatever the caller passes (the human
 * may have edited the AI draft before approving), never the stored `draft_reply`
 * silently re-read, so an edit made in the UI is what actually reaches Google. Requires
 * the review's connection to still be `google_business_profile` and connected; requires
 * `reviews.publish` (the permission CRM-01.2's own role-seeding migration already
 * reserved for exactly this). This is the one action in this module that posts content
 * to a real external service on the business's behalf -- the UI's own "this publishes
 * externally and uses this business's Google authorization" notice is what CRM-08.6's
 * third acceptance criterion asks for; this function is the actual authorized call that
 * notice describes.
 */
export async function publishReviewResponse(businessId: string, reviewId: string, replyText: string): Promise<void> {
  await requireModule(businessId, "crm");
  await requirePermission(businessId, "reviews.publish");

  const trimmed = replyText.trim();
  if (!trimmed) throw new Error("A reply can't be empty.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: review, error: reviewError } = await supabase.from("review_item").select("*").eq("id", reviewId).eq("business_id", businessId).maybeSingle();
  if (reviewError) throw reviewError;
  if (!review) throw new Error("This review could not be found.");
  const reviewRow = review as ReviewItem;
  if (!reviewRow.channel_connection_id) throw new Error("This review has no connected Google Business Profile location to publish to.");

  const connection = await getChannelConnection(businessId, reviewRow.channel_connection_id);
  if (!connection || connection.channel !== "google_business_profile" || connection.status === "disconnected") {
    throw new Error("This review's Google Business Profile connection is no longer available -- reconnect the location first.");
  }
  const accessToken = await getDecryptedAccessToken(businessId, connection.id);
  if (!accessToken) throw new Error("This connection has no access token on file -- reconnect it first.");

  const result = await publishGoogleBusinessProfileReviewReply({ locationName: connection.external_account_id, accessToken }, reviewRow.external_review_id, trimmed);
  if (!result.ok) throw new Error(result.detail);

  const { error: updateError } = await supabase.from("review_item").update({ status: "responded" }).eq("id", reviewId).eq("business_id", businessId);
  if (updateError) throw updateError;

  await writeAuditLog({
    businessId,
    actorId: user?.id ?? null,
    action: "crm_review_item.response_published",
    entityType: "crm_review_item",
    entityId: reviewId,
    after: { status: "responded", replyLength: trimmed.length },
  });
}
