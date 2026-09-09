"use server";

import { revalidatePath } from "next/cache";
import { createChannel, setChannelActive } from "@cofounderai/module-crm/lib/channels/mutations";
import type { ChannelKind } from "@cofounderai/module-crm/lib/channels/types";
import {
  connectChannelAccount,
  disconnectChannelAccount,
  setInstantReplyMode,
} from "@cofounderai/module-crm/lib/channel-accounts/mutations";
import type { ChannelProvider, InstantReplyMode } from "@cofounderai/module-crm/lib/channel-accounts/types";

function detailPath(businessId: string) {
  return `/dashboard/businesses/${businessId}/crm/channels`;
}

export async function createChannelAction(businessId: string, kind: ChannelKind, name: string): Promise<void> {
  await createChannel(businessId, kind, name);
  revalidatePath(detailPath(businessId));
}

export async function setChannelActiveAction(businessId: string, channelId: string, isActive: boolean): Promise<void> {
  await setChannelActive(channelId, isActive);
  revalidatePath(detailPath(businessId));
}

export async function connectChannelAccountAction(
  businessId: string,
  input: { channelId: string; provider: ChannelProvider; externalAccountId: string; accessToken: string; refreshToken?: string },
): Promise<void> {
  await connectChannelAccount(businessId, input);
  revalidatePath(detailPath(businessId));
}

export async function disconnectChannelAccountAction(businessId: string, channelAccountId: string): Promise<void> {
  await disconnectChannelAccount(channelAccountId);
  revalidatePath(detailPath(businessId));
}

export async function setInstantReplyModeAction(businessId: string, channelAccountId: string, mode: InstantReplyMode): Promise<void> {
  await setInstantReplyMode(channelAccountId, mode);
  revalidatePath(detailPath(businessId));
}
