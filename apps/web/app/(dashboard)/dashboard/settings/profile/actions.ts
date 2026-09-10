"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@cofounderai/core/db/server";
import type { RenameActionState } from "@cofounderai/module-discovery/lib/tenancy/types";

export async function updateProfileAction(
  _prevState: RenameActionState,
  formData: FormData,
): Promise<RenameActionState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const jobTitle = String(formData.get("jobTitle") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();

  const supabase = await createClient();
  // updateUser's `data` merges into existing user_metadata -- it doesn't replace it, so
  // this can't clobber avatar_url (set separately by updateAvatarAction) or OAuth-provided
  // fields like `picture`.
  const { error } = await supabase.auth.updateUser({
    data: {
      full_name: fullName || null,
      bio: bio || null,
      phone: phone || null,
      job_title: jobTitle || null,
      location: location || null,
      timezone: timezone || null,
    },
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/settings/profile");
  revalidatePath("/dashboard");
  return { success: true };
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function updateAvatarAction(
  _prevState: RenameActionState,
  formData: FormData,
): Promise<RenameActionState> {
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload." };
  }
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    return { error: "Only PNG, JPEG, WebP, or GIF images are supported." };
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return { error: "Image must be 5MB or smaller." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  // Path is prefixed by the user's own id (storage RLS in
  // 20260906110000_avatars_storage_bucket.sql checks exactly this against auth.uid()), and
  // timestamped so a re-upload doesn't fight browser/CDN caching on the old file's URL.
  const extension = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${user.id}/avatar-${Date.now()}.${extension}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { contentType: file.type, upsert: true });
    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);

    const { error: updateError } = await supabase.auth.updateUser({
      data: { avatar_url: publicUrl },
    });
    if (updateError) throw updateError;
  } catch (error) {
    unstable_rethrow(error);
    return { error: error instanceof Error ? error.message : "Something went wrong." };
  }

  revalidatePath("/dashboard/settings/profile");
  revalidatePath("/dashboard");
  return { success: true };
}
