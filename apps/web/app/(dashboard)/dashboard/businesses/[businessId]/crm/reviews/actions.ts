"use server";

import { revalidatePath } from "next/cache";
import {
  connectGoogleBusinessProfileLocation,
  draftReviewResponse,
  publishReviewResponse,
  syncGoogleBusinessProfileReviews,
} from "@cofounderai/module-crm/lib/reviews/mutations";
import { disconnectChannelConnection } from "@cofounderai/module-crm/lib/channel-connections/mutations";

export type ConnectGoogleBusinessProfileActionState = { error: string } | null;

function reviewsPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/crm/reviews`;
}

export async function connectGoogleBusinessProfileAction(
  businessId: string,
  _prevState: ConnectGoogleBusinessProfileActionState,
  formData: FormData,
): Promise<ConnectGoogleBusinessProfileActionState> {
  const accountId = String(formData.get("accountId") || "").trim();
  const locationId = String(formData.get("locationId") || "").trim();
  const accessToken = String(formData.get("accessToken") || "").trim();
  if (!accountId || !locationId || !accessToken) return { error: "Account ID, location ID, and access token are all required." };

  const result = await connectGoogleBusinessProfileLocation(businessId, { accountId, locationId, accessToken });
  if (!result.ok) return { error: result.error };

  revalidatePath(reviewsPath(businessId));
  return null;
}

export async function disconnectGoogleBusinessProfileAction(businessId: string, connectionId: string): Promise<void> {
  await disconnectChannelConnection(businessId, connectionId);
  revalidatePath(reviewsPath(businessId));
}

export async function syncGoogleBusinessProfileReviewsAction(businessId: string, connectionId: string): Promise<void> {
  await syncGoogleBusinessProfileReviews(businessId, connectionId);
  revalidatePath(reviewsPath(businessId));
}

/** CRM-08.6: generates (or reuses a cached) AI draft -- never publishes anything, so no
 * `revalidatePath` is needed; the dialog holds the draft in its own component state
 * until the human approves it. */
export async function generateReviewDraftAction(businessId: string, reviewId: string): Promise<{ draftReply: string } | { error: string }> {
  try {
    return await draftReviewResponse(businessId, reviewId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate a draft reply." };
  }
}

export async function publishReviewResponseAction(businessId: string, reviewId: string, replyText: string): Promise<{ error: string } | void> {
  try {
    await publishReviewResponse(businessId, reviewId, replyText);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not publish this reply." };
  }
  revalidatePath(reviewsPath(businessId));
}
