import type { SupabaseClient } from "@supabase/supabase-js";
import { checkShare, hashShareToken, isWellFormedShareToken, type ShareVerdict } from "./files";

/**
 * FND-12 — resolving a data-room share link for someone outside the business (§29.6).
 *
 * The recipient has no account, so this runs with the service-role client — which is why
 * it does its own authorisation, entirely from the link: the token must hash to a share
 * that is neither revoked nor expired, for a document that still has a file. Only then is
 * a signed URL minted, valid for one minute, and the access recorded. Nothing about the
 * business, the document list or other shares is ever returned.
 */
export type ShareAccess =
  | { ok: true; url: string }
  | { ok: false; reason: Exclude<ShareVerdict, { ok: true }>["reason"] | "malformed" };

const SIGNED_URL_SECONDS = 60;

export async function resolveShareAccess(
  token: string,
  clients: { discovery: SupabaseClient; core: SupabaseClient },
  meta: { userAgent: string | null; now?: Date },
): Promise<ShareAccess> {
  if (!isWellFormedShareToken(token)) return { ok: false, reason: "malformed" };
  const now = meta.now ?? new Date();

  const { data: share, error: shareError } = await clients.discovery
    .from("data_room_shares")
    .select("id, business_id, data_room_item_id, permission, expires_at, revoked_at")
    .eq("token_hash", hashShareToken(token))
    .maybeSingle();
  if (shareError) throw shareError;
  if (!share) return { ok: false, reason: "not_found" };

  const { data: item, error: itemError } = await clients.discovery
    .from("data_room_items")
    .select("attachment_id, status, expires_at, name")
    .eq("business_id", share.business_id)
    .eq("id", share.data_room_item_id)
    .maybeSingle();
  if (itemError) throw itemError;

  const verdict = checkShare(
    { revokedAt: share.revoked_at as string | null, expiresAt: share.expires_at as string },
    item
      ? { attachmentId: item.attachment_id as string | null, status: item.status as string, expiresAt: item.expires_at as string | null }
      : null,
    now,
  );
  if (!verdict.ok) return verdict;

  const { data: attachment, error: attError } = await clients.core
    .from("attachments")
    .select("storage_bucket, storage_path, file_name")
    .eq("business_id", share.business_id)
    .eq("id", item!.attachment_id)
    .maybeSingle();
  if (attError) throw attError;
  if (!attachment) return { ok: false, reason: "item_unavailable" };

  const download = share.permission === "download";
  const { data: signed, error: signError } = await clients.core.storage
    .from(attachment.storage_bucket as string)
    .createSignedUrl(attachment.storage_path as string, SIGNED_URL_SECONDS, download ? { download: attachment.file_name as string } : undefined);
  if (signError || !signed?.signedUrl) throw signError ?? new Error("Could not sign the document link.");

  const { error: eventError } = await clients.discovery.from("data_room_access_events").insert({
    business_id: share.business_id,
    share_id: share.id,
    data_room_item_id: share.data_room_item_id,
    action: download ? "download" : "view",
    user_agent: meta.userAgent?.slice(0, 500) ?? null,
  });
  if (eventError) throw eventError;

  return { ok: true, url: signed.signedUrl };
}
