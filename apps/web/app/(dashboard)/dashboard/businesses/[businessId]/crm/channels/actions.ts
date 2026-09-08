"use server";

import { revalidatePath } from "next/cache";
import { createChannel, setChannelActive } from "@cofounderai/module-crm/lib/channels/mutations";
import type { ChannelKind } from "@cofounderai/module-crm/lib/channels/types";

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
