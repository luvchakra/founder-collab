"use server";

import { revalidatePath } from "next/cache";
import {
  connectAiProvider,
  disconnectAiProvider,
} from "@cofounderai/module-discovery/lib/ai-providers/mutations";
import type { AiProvider } from "@cofounderai/module-discovery/lib/ai-providers/types";

const SETTINGS_PATH = "/dashboard/settings/ai-provider";

export type ConnectProviderActionState = { error: string } | null;

function isAiProvider(value: string): value is AiProvider {
  return value === "openai" || value === "anthropic" || value === "google";
}

export async function connectProviderAction(
  accountId: string,
  _prevState: ConnectProviderActionState,
  formData: FormData,
): Promise<ConnectProviderActionState> {
  const provider = String(formData.get("provider") ?? "");
  const apiKey = String(formData.get("apiKey") ?? "");

  if (!isAiProvider(provider)) {
    return { error: "Choose an AI provider." };
  }

  try {
    await connectAiProvider(accountId, provider, apiKey);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Connection failed." };
  }

  revalidatePath(SETTINGS_PATH);
  return null;
}

export async function disconnectProviderAction(accountId: string) {
  await disconnectAiProvider(accountId);
  revalidatePath(SETTINGS_PATH);
}
