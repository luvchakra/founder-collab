"use server";

import { revalidatePath } from "next/cache";
import {
  createAnnouncement,
  deleteAnnouncement,
  updateAnnouncement,
  type CreateAnnouncementInput,
  type DeleteAnnouncementInput,
  type UpdateAnnouncementInput,
} from "@cofounderai/core/admin/platform-announcements";

/**
 * PLATFORM-P0-15.1-15.4 ("Global Announcements / Maintenance", §19). Every action here is
 * a thin `revalidatePath` wrapper over the one audited mutation path in
 * `platform-announcements.ts` -- there is no plain, reason-free mutation anywhere in this
 * file, matching that module's own "every change is audited" stance.
 */

export async function createAnnouncementAction(
  input: CreateAnnouncementInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  const result = await createAnnouncement(input);
  if (!result.ok) return result;
  revalidatePath("/platform/announcements");
  return result;
}

export async function updateAnnouncementAction(
  input: UpdateAnnouncementInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  const result = await updateAnnouncement(input);
  if (!result.ok) return result;
  revalidatePath("/platform/announcements");
  return result;
}

export async function deleteAnnouncementAction(
  input: DeleteAnnouncementInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await deleteAnnouncement(input);
  if (!result.ok) return result;
  revalidatePath("/platform/announcements");
  return result;
}
