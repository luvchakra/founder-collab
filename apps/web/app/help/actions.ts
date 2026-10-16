"use server";

import { createClient } from "@cofounderai/core/db/server";
import { answerHelpQuestion, type HelpAnswer } from "@cofounderai/core/help/assistant";

export type HelpAskState =
  | { status: "idle" }
  | { status: "error"; question: string; message: string }
  | ({ status: "answered"; question: string } & HelpAnswer);

/**
 * Signed-in only, like the rest of help (2026-10-16). A server action can be posted to any
 * page's URL, so the proxy's redirect on /help doesn't cover it: without a session this
 * refuses and returns no help text at all -- neither the AI-written answer nor the guide
 * sections the free keyword search would have found.
 */
export async function askHelp(_prev: HelpAskState, formData: FormData): Promise<HelpAskState> {
  const question = String(formData.get("question") ?? "").trim();
  if (!question) return { status: "idle" };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { status: "error", question, message: "Sign in to ask a question." };
  }

  const answer = await answerHelpQuestion(question);
  return { status: "answered", question, ...answer };
}
