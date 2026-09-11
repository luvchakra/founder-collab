"use server";

import { revalidatePath } from "next/cache";
import { connectWhatsApp, disconnectChannelConnection } from "@cofounderai/module-crm/lib/channel-connections/mutations";

export type WhatsAppConnectActionState = { error: string } | null;

function whatsappPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/crm/whatsapp`;
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
