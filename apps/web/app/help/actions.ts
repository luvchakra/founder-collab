"use server";

import { createClient } from "@cofounderai/core/db/server";
import { answerHelpQuestion, searchHelpSections, type HelpAnswer } from "@cofounderai/core/help/assistant";

export type HelpAskState =
  | { status: "idle" }
  | { status: "error"; question: string; message: string }
  | ({ status: "answered"; question: string } & HelpAnswer);

/**
 * Open to everyone, but only a signed-in visitor gets an AI-written answer.
 *
 * `/help` is public, which means this action is reachable by anyone on the internet, and
 * writing an answer costs the platform's own AI credit. An open endpoint that spends
 * money per request is a bill somebody else gets to run up.
 *
 * The split falls out of how the assistant already works: finding the right guide sections
 * is deterministic keyword scoring over our own documentation — free, fast, and the half
 * that produces the links. So an anonymous visitor gets exactly that, labelled as what it
 * is, and signing in adds the written answer on top. Nobody is turned away from the
 * documentation; the only thing behind the session is the spend.
 */
export async function askHelp(_prev: HelpAskState, formData: FormData): Promise<HelpAskState> {
  const question = String(formData.get("question") ?? "").trim();
  if (!question) return { status: "idle" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const answer = user ? await answerHelpQuestion(question) : searchHelpSections(question);
  return { status: "answered", question, ...answer };
}
