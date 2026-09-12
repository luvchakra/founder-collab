"use server";

import { revalidatePath } from "next/cache";
import {
  updateEmailTemplate,
  type UpdateEmailTemplateInput,
} from "@cofounderai/core/admin/platform-email-templates";

/**
 * PLATFORM-P0-11.2 (System Email Templates, config-only, §15). A thin `revalidatePath`
 * wrapper over the one audited mutation path in `platform-email-templates.ts`.
 */
export async function updateEmailTemplateAction(
  input: UpdateEmailTemplateInput,
): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  const result = await updateEmailTemplate(input);
  if (!result.ok) return result;
  revalidatePath("/platform/email-templates");
  return result;
}
