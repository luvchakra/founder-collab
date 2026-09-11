import { createClient } from "../../db/server";
import type { ReviewItem } from "./types";

/** CRM-08.5's "reviews can be listed for connected locations" -- newest first, same
 * ordering the Conversations/Lost Business queues already use for their own "most
 * recent thing needing attention first" framing. No pagination cap needed yet: a
 * business's total review volume is far smaller than its message volume, and CRM-14.2's
 * own dashboard count query already established the "no cap" precedent for this table. */
export async function listReviewItems(businessId: string): Promise<ReviewItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("review_item").select("*").eq("business_id", businessId).order("occurred_at", { ascending: false });
  if (error) throw error;
  return data as ReviewItem[];
}
