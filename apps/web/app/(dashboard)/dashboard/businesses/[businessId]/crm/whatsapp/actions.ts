"use server";

import { revalidatePath } from "next/cache";
import { connectWhatsApp, disconnectChannelConnection } from "@cofounderai/module-crm/lib/channel-connections/mutations";
import { createWhatsAppTemplate, deactivateWhatsAppTemplate } from "@cofounderai/module-crm/lib/whatsapp/templates";
import { checkWhatsAppConnectionNow } from "@cofounderai/module-crm/lib/whatsapp/health";

export type WhatsAppConnectActionState = { error: string } | null;

function whatsappPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/crm/whatsapp`;
}

export type CreateWhatsAppTemplateActionState = { error: string } | null;

/** CRM-07.8: registers a template that's already been created and approved on Meta's
 * side -- this doesn't submit anything to Meta, it's local bookkeeping so the send flow
 * knows the template's name/language/variable count. */
export async function createWhatsAppTemplateAction(businessId: string, _prevState: CreateWhatsAppTemplateActionState, formData: FormData): Promise<CreateWhatsAppTemplateActionState> {
  const name = String(formData.get("name") || "").trim();
  const languageCode = String(formData.get("languageCode") || "").trim();
  const variableCount = Number(formData.get("variableCount") || 0);
  if (!name || !languageCode) return { error: "Template name and language code are both required." };
  if (!Number.isInteger(variableCount) || variableCount < 0) return { error: "Variable count must be a non-negative whole number." };

  try {
    await createWhatsAppTemplate(businessId, { name, languageCode, variableCount });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save this template." };
  }

  revalidatePath(whatsappPath(businessId));
  return null;
}

export async function deactivateWhatsAppTemplateAction(businessId: string, templateId: string): Promise<void> {
  await deactivateWhatsAppTemplate(businessId, templateId);
  revalidatePath(whatsappPath(businessId));
}

export async function connectWhatsAppAction(businessId: string, _prevState: WhatsAppConnectActionState, formData: FormData): Promise<WhatsAppConnectActionState> {
  const phoneNumberId = String(formData.get("phoneNumberId") || "").trim();
  const accessToken = String(formData.get("accessToken") || "").trim();
  if (!phoneNumberId || !accessToken) return { error: "Phone number ID and access token are both required." };

  const result = await connectWhatsApp(businessId, { phoneNumberId, accessToken });
  if (!result.ok) return { error: result.error };

  revalidatePath(whatsappPath(businessId));
  return null;
}

export async function disconnectWhatsAppAction(businessId: string, connectionId: string): Promise<void> {
  await disconnectChannelConnection(businessId, connectionId);
  revalidatePath(whatsappPath(businessId));
}

/** CRM-15.5's visible resolution path for a `degraded`/`provider_error` connection --
 * re-verifies the stored token against Meta right now instead of waiting for the
 * periodic health-check cron to get to it. */
export async function checkWhatsAppConnectionNowAction(businessId: string, connectionId: string): Promise<void> {
  await checkWhatsAppConnectionNow(businessId, connectionId);
  revalidatePath(whatsappPath(businessId));
}
