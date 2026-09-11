import type { GoogleBusinessProfileCredentials, NormalizedGoogleBusinessProfileReview, RawGoogleBusinessProfileReview } from "./types";

const MY_BUSINESS_API_BASE = "https://mybusiness.googleapis.com/v4";

const STAR_RATING_MAP: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/** Pure mapping, separated from the fetch call below so it's unit-testable against real
 * API response shapes without a network mock -- same split `whatsapp/cloud-api-
 * adapter.ts#parseWhatsAppWebhookPayload` already uses. `STAR_RATING_UNSPECIFIED` and a
 * missing/unrecognized value both map to `null` rather than `0`, since `crm.review_item.
 * rating` has no "unrated" sentinel of its own. */
export function normalizeGoogleBusinessProfileReview(raw: RawGoogleBusinessProfileReview): NormalizedGoogleBusinessProfileReview {
  return {
    externalReviewId: raw.reviewId,
    rating: raw.starRating ? STAR_RATING_MAP[raw.starRating] ?? null : null,
    commentExcerpt: raw.comment?.trim() || null,
    reviewerName: raw.reviewer?.isAnonymous ? null : raw.reviewer?.displayName?.trim() || null,
    occurredAt: raw.createTime,
    hasReply: raw.reviewReply != null,
  };
}

async function listReviewsPage(
  credentials: GoogleBusinessProfileCredentials,
  pageToken?: string,
): Promise<{ ok: true; reviews: RawGoogleBusinessProfileReview[]; nextPageToken: string | null } | { ok: false; detail: string; statusCode?: number }> {
  const url = new URL(`${MY_BUSINESS_API_BASE}/${credentials.locationName}/reviews`);
  url.searchParams.set("pageSize", "50");
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  try {
    const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${credentials.accessToken}` } });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { ok: false, detail: `Google Business Profile API returned ${response.status}.${detail ? ` ${detail}` : ""}`, statusCode: response.status };
    }
    const json = (await response.json().catch(() => null)) as { reviews?: RawGoogleBusinessProfileReview[]; nextPageToken?: string } | null;
    return { ok: true, reviews: json?.reviews ?? [], nextPageToken: json?.nextPageToken ?? null };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/** CRM-08.5's own connection check: the same `reviews.list` call the sync path makes,
 * capped to one review -- there is no separate "get location" read this story's
 * acceptance criteria need, and reusing the real read path means a bad location id or an
 * access token missing the Business Profile scope surfaces immediately, same as
 * `whatsAppCloudApiAdapter.connect()`'s own "verify before ever storing anything". */
export async function verifyGoogleBusinessProfileLocation(credentials: GoogleBusinessProfileCredentials): Promise<{ ok: boolean; detail?: string; statusCode?: number }> {
  const result = await listReviewsPage(credentials);
  if (!result.ok) return { ok: false, detail: result.detail, statusCode: result.statusCode };
  return { ok: true };
}

/** Fetches every review for one connected location, following pagination up to a fixed
 * cap (5 pages / 250 reviews) -- generous for a single location's review inbox, and a
 * hard stop rather than an unbounded loop if the API ever returns a `nextPageToken` that
 * doesn't terminate. */
const MAX_PAGES = 5;

export async function listAllGoogleBusinessProfileReviews(
  credentials: GoogleBusinessProfileCredentials,
): Promise<{ ok: true; reviews: NormalizedGoogleBusinessProfileReview[] } | { ok: false; detail: string; statusCode?: number }> {
  const reviews: RawGoogleBusinessProfileReview[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await listReviewsPage(credentials, pageToken);
    if (!result.ok) return { ok: false, detail: result.detail, statusCode: result.statusCode };
    reviews.push(...result.reviews);
    if (!result.nextPageToken) break;
    pageToken = result.nextPageToken;
  }

  return { ok: true, reviews: reviews.map(normalizeGoogleBusinessProfileReview) };
}
