import { requireModule } from "@cofounderai/core/licensing/queries";
import { requirePermission } from "@cofounderai/core/rbac/require-permission";
import { encryptApiKey } from "@cofounderai/core/crypto/api-key";
import { writeAuditLog } from "@cofounderai/core/audit/mutations";
import { createClient } from "../../db/server";
import { getChannelConnection, getDecryptedAccessToken } from "../channel-connections/queries";
import { listAllGoogleBusinessProfileReviews, verifyGoogleBusinessProfileLocation } from "./google-business-profile-adapter";
import type { ReviewItemStatus } from "./types";

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
