"use server";

import { createClient } from "@cofounderai/core/db/server";
import { answerHelpQuestion, type HelpAnswer } from "@cofounderai/core/help/assistant";

export type HelpAskState =
  | { status: "idle" }
  | { status: "error"; question: string; message: string }
  | ({ status: "answered"; question: string } & HelpAnswer);

/**
 * Signed-in only. The help content itself is not secret, but this action spends the
 * platform's own AI credit, so it is not an open endpoint -- the session check is the
 * thing standing between "a help box" and "a free LLM for anyone who finds the URL".
 */
export async function askHelp(_prev: HelpAskState, formData: FormData): Promise<HelpAskState> {
  const question = String(formData.get("question") ?? "").trim();
  if (!question) return { status: "idle" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { status: "error", question, message: "Sign in to ask the assistant." };
  }

  const answer = await answerHelpQuestion(question);
  return { status: "answered", question, ...answer };
}
