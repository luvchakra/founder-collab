/** crm.review_item row (CRM-01.2's schema baseline, unused until this story writes to
 * it) -- `status` doubles as the "reply state" CRM-08.5's own acceptance criteria ask
 * for: `new` means no reply yet, `responded` means the location has replied on the
 * provider's side, `in_progress`/`dismissed` are a human's own workflow states on top. */
export type ReviewItemStatus = "new" | "in_progress" | "responded" | "dismissed";

export type ReviewItem = {
  id: string;
  business_id: string;
  channel_connection_id: string | null;
  party_id: string | null;
  provider: string;
  external_review_id: string;
  rating: number | null;
  comment_excerpt: string | null;
  reviewer_name: string | null;
  occurred_at: string;
  status: ReviewItemStatus;
  /** CRM-08.6's AI-drafted reply, pending human review -- cleared once actually
   * published (the published text is whatever the human approved, which may have been
   * edited from this draft, so it isn't kept as a second copy of the same string). */
  draft_reply: string | null;
  draft_input_hash: string | null;
  draft_generated_at: string | null;
  created_at: string;
  updated_at: string;
};

/** What the adapter needs to call a specific connected location -- mirrors
 * `whatsapp/types.ts#WhatsAppConnectionCredentials`'s own "decrypted token only, never
 * touches storage" split. `locationName` is the API's own `accounts/{accountId}/
 * locations/{locationId}` resource path, stored verbatim as
 * `crm.channel_connection.external_account_id` so it round-trips without reparsing. */
export type GoogleBusinessProfileCredentials = {
  locationName: string;
  accessToken: string;
};

/** One review as the Google My Business API v4 `reviews.list` resource returns it --
 * see https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews
 * (cited by the backlog itself as "[11]"). `starRating` is a string enum
 * (ONE..FIVE), not a number. */
export type RawGoogleBusinessProfileReview = {
  reviewId: string;
  reviewer?: { displayName?: string; isAnonymous?: boolean };
  starRating?: "STAR_RATING_UNSPECIFIED" | "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE";
  comment?: string;
  createTime: string;
  updateTime?: string;
  reviewReply?: { comment: string; updateTime: string };
};

export type NormalizedGoogleBusinessProfileReview = {
  externalReviewId: string;
  rating: number | null;
  commentExcerpt: string | null;
  reviewerName: string | null;
  occurredAt: string;
  hasReply: boolean;
};
