import { createHash } from "node:crypto";
import type { ReplyTopic } from "./reply-draft-core";
import { computeWhatsAppWindowStatus } from "../whatsapp/window";

/**
 * PLATFORM-P1-12.5/12.6 -- the pure half of automatic WhatsApp AI replies
 * (docs/design/crm-whatsapp-ai-replies.md, phase 2). Plain code decides whether an answer
 * may go out without a person; nothing here reads, writes or sends.
 */

export type AiReplyMode = "draft" | "auto";
export const AI_REPLY_MODE_LABELS: Record<AiReplyMode, string> = { draft: "Draft for review", auto: "Send automatically" };

/** Enforced in crm.claim_ai_auto_reply() -- these copies are for the copy that names them. */
export const AUTO_REPLY_DAILY_LIMIT = 100;
export const AUTO_REPLY_CONVERSATION_DAILY_LIMIT = 3;

/** Topics an automatic reply may answer. Order and job status stay with a person: an
 * automatic reply is written without a signed-in session, so the other modules' records
 * aren't read for it, and nothing else on this list needs them. "other" is never sent. */
export const AUTO_SEND_TOPICS: readonly ReplyTopic[] = ["hours_location_contact", "products_prices", "product_info"];

export type AutoReplySkipReason =
  | "not_licensed"
  | "ai_off"
  | "policy_check_failed"
  | "not_connected"
  | "outside_window"
  | "opted_out"
  | "superseded"
  | "already_answered"
  | "no_text"
  | "daily_limit"
  | "conversation_limit"
  | "cannot_answer"
  | "low_confidence"
  | "invalid_output"
  | "needs_person"
  | "topic_not_allowed"
  | "ai_error";

/** One short phrase per reason, for the Conversations page ("Not sent automatically: ..."). */
export const AUTO_REPLY_REASON_LABELS: Record<AutoReplySkipReason | "send_failed", string> = {
  not_licensed: "CRM licence isn't active",
  ai_off: "AI replies are switched off",
  policy_check_failed: "couldn't confirm AI replies are allowed",
  not_connected: "WhatsApp isn't connected",
  outside_window: "WhatsApp's 24-hour window had closed",
  opted_out: "this contact opted out",
  superseded: "a newer message arrived",
  already_answered: "someone already replied",
  no_text: "the message has no text",
  daily_limit: `the daily limit of ${AUTO_REPLY_DAILY_LIMIT} automatic replies was reached`,
  conversation_limit: `${AUTO_REPLY_CONVERSATION_DAILY_LIMIT} automatic replies were already sent in this conversation today`,
  cannot_answer: "the AI couldn't answer from your facts",
  low_confidence: "the AI wasn't confident enough",
  invalid_output: "the AI's answer didn't check out",
  needs_person: "this needs a person",
  topic_not_allowed: "this topic needs a person",
  ai_error: "the AI provider didn't respond",
  send_failed: "WhatsApp refused the send",
};

/** WhatsApp has no opt-out webhook; a customer opts out by sending one of these words on its
 * own (the convention WhatsApp Business senders already follow). Exact match only, so "stop
 * by tomorrow?" is a question, not an opt-out. */
const OPT_OUT_WORDS = new Set(["stop", "stop all", "unsubscribe", "opt out", "optout", "opt-out"]);

export function isWhatsAppOptOutMessage(text: string | null | undefined): boolean {
  const normalized = (text ?? "")
    .toLowerCase()
    .replace(/[.!\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return OPT_OUT_WORDS.has(normalized);
}

/** Same value as core.whatsapp_contact_hash(): namespaced, digits only -- the opt-out is
 * stored as this one-way hash, never the number (PRIV-1). */
export function whatsAppContactHash(phone: string): string {
  return createHash("sha256").update(`whatsapp:${phone.replace(/\D/g, "")}`, "utf8").digest("hex");
}

export type AutoReplyContext = {
  licensed: boolean;
  aiAllowed: boolean | "unknown";
  connected: boolean;
  optedOut: boolean;
  message: string;
  occurredAt: string;
  /** This message is still the conversation's newest inbound one. */
  isLatestInbound: boolean;
  /** A reply (by a person or otherwise) was already recorded after it. */
  alreadyAnswered: boolean;
};

/** The checks that need no claim and no AI call, in a fixed order. A failed policy lookup is
 * "do not send" (CLAUDE.md, AI rule 3), never "assume allowed". */
export function preClaimSkipReason(ctx: AutoReplyContext, now: Date): AutoReplySkipReason | null {
  if (!ctx.licensed) return "not_licensed";
  if (ctx.aiAllowed === "unknown") return "policy_check_failed";
  if (!ctx.aiAllowed) return "ai_off";
  if (!ctx.connected) return "not_connected";
  if (!computeWhatsAppWindowStatus(ctx.occurredAt, now).withinWindow) return "outside_window";
  if (ctx.optedOut) return "opted_out";
  if (!ctx.isLatestInbound) return "superseded";
  if (ctx.alreadyAnswered) return "already_answered";
  if (!ctx.message.trim()) return "no_text";
  return null;
}
