"use server";

import { businessPath } from "@/lib/business-path";
import { revalidatePath } from "next/cache";
import { updateWatchlistEntry, removeFromWatchlist } from "@cofounderai/module-discovery/lib/watchlist/mutations";

type ActionResult = { error: string } | { success: true };

async function watchlistPath(businessId: string, productId: string) {
  return `${await businessPath(businessId)}/discovery/offerings/${productId}/watchlist`;
}

/** DISC-OFFER-P1-01.3: edit a watch from the watchlist row itself. RLS (tenant AND an
 * active Discovery licence, 20260927300100) is what authorizes the write. */
export async function updateWatchFromListAction(
  businessId: string,
  productId: string,
  entryId: string,
  formData: FormData,
): Promise<ActionResult> {
  const watchReason = String(formData.get("watchReason") ?? "").trim();
  if (!watchReason) return { error: "Say why you're watching this account." };
  const nextReviewAtRaw = String(formData.get("nextReviewAt") ?? "").trim();
  try {
    await updateWatchlistEntry(entryId, {
      watchReason,
      nextReviewAt: nextReviewAtRaw === "" ? null : new Date(nextReviewAtRaw).toISOString(),
    });
  } catch {
    return { error: "Could not update this watch." };
  }
  revalidatePath(await watchlistPath(businessId, productId));
  return { success: true };
}

/** DISC-OFFER-P1-01.3: stop watching an account from the watchlist row. */
export async function removeWatchFromListAction(businessId: string, productId: string, entryId: string): Promise<ActionResult> {
  try {
    await removeFromWatchlist(entryId);
  } catch {
    return { error: "Could not stop watching this account." };
  }
  revalidatePath(await watchlistPath(businessId, productId));
  return { success: true };
}
