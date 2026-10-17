"use server";

import { businessPath } from "@/lib/business-path";
import { revalidatePath } from "next/cache";
import { createChannel, setChannelActive } from "@cofounderai/module-crm/lib/channels/mutations";
import type { ChannelKind } from "@cofounderai/module-crm/lib/channels/types";
import {
  connectChannelAccount,
  disconnectChannelAccount,
  setInstantReplyMode,
} from "@cofounderai/module-crm/lib/channel-accounts/mutations";
import type { ChannelProvider, InstantReplyMode } from "@cofounderai/module-crm/lib/channel-accounts/types";
import { saveInstantAckText } from "@cofounderai/module-crm/lib/instant-reply/settings";

async function detailPath(businessId: string) {
  return `${await businessPath(businessId)}/crm/channels`;
}

export async function createChannelAction(businessId: string, kind: ChannelKind, name: string): Promise<void> {
  await createChannel(businessId, kind, name);
  revalidatePath(await detailPath(businessId));
}

export async function setChannelActiveAction(businessId: string, channelId: string, isActive: boolean): Promise<void> {
  await setChannelActive(businessId, channelId, isActive);
  revalidatePath(await detailPath(businessId));
}

export async function connectChannelAccountAction(
  businessId: string,
  input: { channelId: string; provider: ChannelProvider; externalAccountId: string; accessToken: string; refreshToken?: string },
): Promise<void> {
  await connectChannelAccount(businessId, input);
  revalidatePath(await detailPath(businessId));
}

export async function disconnectChannelAccountAction(businessId: string, channelAccountId: string): Promise<void> {
  await disconnectChannelAccount(businessId, channelAccountId);
  revalidatePath(await detailPath(businessId));
}

export async function setInstantReplyModeAction(businessId: string, channelAccountId: string, mode: InstantReplyMode): Promise<void> {
  await setInstantReplyMode(businessId, channelAccountId, mode);
  revalidatePath(await detailPath(businessId));
}

/** CRM-INSTANT-ACK-01: the acknowledgement text. */
export async function saveInstantAckTextAction(businessId: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await saveInstantAckText(businessId, text);
  if (result.ok) revalidatePath(await detailPath(businessId));
  return result;
}
