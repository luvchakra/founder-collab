"use client";

import { useActionState, useRef, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Textarea } from "@cofounderai/core/ui/textarea";
import { Button } from "@cofounderai/core/ui/button";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import type { ResponseQualityFlag } from "@cofounderai/module-crm/lib/conversations/response-quality";
import type { StoredReplyDraft } from "@cofounderai/module-crm/lib/ai/reply-draft";
import type { SendWhatsAppReplyActionState } from "./actions";

const SOURCE_LABELS: Record<string, string> = {
  party_contact_info: "contact info",
  product_interest: "product interest",
  discovery_research: "Discovery research",
  recent_orders: "recent orders",
  recent_jobs: "recent jobs",
};

const FLAG_LABELS: Record<ResponseQualityFlag["type"], string> = {
  unanswered_question: "Unanswered question",
  unsupported_claim: "Unsupported claim",
  missing_price_or_availability: "Missing price/availability",
  overly_long: "Overly long",
  risky_or_uncertain: "Risky or uncertain",
  wrong_customer_or_context: "Wrong customer/context",
};

/**
 * CRM-07.6's free-form WhatsApp reply composer -- shown only when CRM-07.7's 24-hour
 * window is open (the page itself decides that and renders `WindowClosedNotice` instead
 * when it's not, see page.tsx). Clears on a successful send by remounting via `key`
 * (the parent passes a fresh one per conversation/interaction-count so the textarea
 * doesn't carry stale text into the next conversation either).
 *
 * CRM-09.6's suggested response is a template (draft-reply.ts), labelled as one.
 * PLATFORM-P1-12.1's "Draft with AI" writes a real answer from the business's own facts
 * (lib/ai/reply-draft.ts) and shows which facts it used. "Use this draft" only fills the textarea via a
 * ref -- it never submits anything itself, so "user must explicitly send" and "user can
 * edit" both hold unchanged.
 *
 * CRM-09.7's "Check" button runs `checkResponseQualityAction` outside the form's own
 * submission cycle (same pattern as "Generate AI draft" on the Reviews page, CRM-08.6) --
 * it only ever displays flags for the human to weigh, never disables or intercepts
 * "Send" itself, so "optionally flag" and "no autonomous send" both hold regardless of
 * the result.
 */
export function WhatsAppReplyForm({
  action,
  checkAction,
  suggestedDraft,
  suggestedDraftSources,
  aiDraft: initialAiDraft,
  draftAction,
}: {
  action: (state: SendWhatsAppReplyActionState, formData: FormData) => Promise<SendWhatsAppReplyActionState>;
  checkAction: (draftText: string) => Promise<{ flags: ResponseQualityFlag[] } | { error: string }>;
  suggestedDraft?: string | null;
  suggestedDraftSources?: string[];
  /** PLATFORM-P1-12.1: the stored AI draft for the latest customer message, if one was made. */
  aiDraft?: StoredReplyDraft | null;
  draftAction?: () => Promise<StoredReplyDraft | { error: string }>;
}) {
  const [aiDraft, setAiDraft] = useState<StoredReplyDraft | null>(initialAiDraft ?? null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [isDrafting, setIsDrafting] = useState(false);

  async function runDraft() {
    if (!draftAction) return;
    setIsDrafting(true);
    setDraftError(null);
    const result = await draftAction();
    setIsDrafting(false);
    if ("error" in result) setDraftError(result.error);
    else setAiDraft(result);
  }

  function fill(text: string) {
    if (textareaRef.current) textareaRef.current.value = text;
  }

  const [state, formAction] = useActionState<SendWhatsAppReplyActionState, FormData>(action, null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [flags, setFlags] = useState<ResponseQualityFlag[] | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  async function runCheck() {
    const text = textareaRef.current?.value.trim();
    if (!text) return;
    setIsChecking(true);
    setCheckError(null);
    const result = await checkAction(text);
    setIsChecking(false);
    if ("error" in result) {
      setCheckError(result.error);
      return;
    }
    setFlags(result.flags);
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 border-t border-border pt-3">
      {aiDraft?.status === "answered" ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-primary/40 p-2">
          <p className="text-xs font-medium text-muted-foreground">
            AI draft -- based on {aiDraft.factsUsed.map((f) => f.label).join(", ")}
          </p>
          <p className="text-sm">{aiDraft.answer}</p>
          <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => fill(aiDraft.answer)}>
            Use this draft
          </Button>
        </div>
      ) : suggestedDraft || draftAction ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {aiDraft?.status === "not_answerable"
                ? "AI couldn't answer this from your business details -- reply yourself."
                : `Suggested reply (template)${suggestedDraftSources?.length ? ` -- based on ${suggestedDraftSources.map((s) => SOURCE_LABELS[s] ?? s).join(", ")}` : ""}`}
            </p>
            {draftAction && !aiDraft ? (
              <Button type="button" size="sm" variant="ghost" onClick={runDraft} disabled={isDrafting}>
                {isDrafting ? "Drafting..." : "Draft with AI"}
              </Button>
            ) : null}
          </div>
          {draftError ? <p className="text-xs text-destructive">{draftError}</p> : null}
          {suggestedDraft && aiDraft?.status !== "not_answerable" ? (
            <>
              <p className="text-sm">{suggestedDraft}</p>
              <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => fill(suggestedDraft)}>
                Use this draft
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
      <Textarea ref={textareaRef} name="text" placeholder="Type a WhatsApp reply..." rows={2} required onChange={() => setFlags(null)} />

      {flags && flags.length > 0 ? (
        <ul className="flex flex-col gap-1 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-2 text-xs">
          {flags.map((f, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
              <span>
                <span className="font-medium">{FLAG_LABELS[f.type]}:</span> {f.detail}
              </span>
            </li>
          ))}
        </ul>
      ) : flags && flags.length === 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-emerald-600" />
          No issues found.
        </p>
      ) : null}
      {checkError ? (
        <p role="alert" className="text-xs text-destructive">
          {checkError}
        </p>
      ) : null}

      {state?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={runCheck} disabled={isChecking}>
          {isChecking ? "Checking..." : "Check before sending"}
        </Button>
        <SubmitButton size="sm" pendingText="Sending...">
          Send
        </SubmitButton>
      </div>
    </form>
  );
}
