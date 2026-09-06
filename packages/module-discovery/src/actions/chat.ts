"use server";

import {
  getChatPanelData,
  sendChatMessage,
  type ChatMessage,
  type ChatPageContext,
  type ChatReply,
} from "../lib/ai/chat";
import { AiProviderError } from "../lib/ai/router";
import { UsageLimitExceededError } from "../lib/usage/limits";

export async function sendChatMessageAction(
  messages: ChatMessage[],
  context: ChatPageContext,
): Promise<ChatReply | { error: string }> {
  try {
    return await sendChatMessage(messages, context);
  } catch (error) {
    if (error instanceof AiProviderError || error instanceof UsageLimitExceededError) {
      return { error: error.message };
    }
    console.error("[chat] sendChatMessageAction failed:", error);
    return { error: "Something went wrong. Try again." };
  }
}

/** One call for everything the panel needs to open against a business/product --
 * history, follow-up, and starter questions -- instead of two separate actions that each
 * independently resolved the same context (see getChatPanelData's own comment). */
export async function getChatPanelDataAction(context: ChatPageContext): Promise<{
  messages: ChatMessage[];
  followUp: string | null;
  starterQuestions: string[];
}> {
  try {
    return await getChatPanelData(context);
  } catch (error) {
    console.error("[chat] getChatPanelDataAction failed:", error);
    return { messages: [], followUp: null, starterQuestions: [] };
  }
}
