"use client";

import { useActionState, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Input } from "@cofounderai/core/ui/input";
import { SubmitButton } from "@cofounderai/core/ui/submit-button";
import { askHelp, type HelpAskState } from "@/app/(dashboard)/dashboard/help/actions";

/**
 * Ask-a-question box for the user guides.
 *
 * One question at a time rather than a running chat transcript, on purpose: people arrive
 * here stuck on one thing, and the answer's value is the link it hands them into the
 * guide. A scrollback of previous answers would push that link off screen and invite the
 * follow-up questions a documentation assistant cannot answer anyway, because it only
 * knows what the guides say.
 *
 * The answer always shows its sources, and the sources are chosen before the model runs
 * (see core/help/assistant.ts), so every link here goes somewhere real.
 */
export function HelpAssistant({
  suggestions = [],
  compact = false,
}: {
  /** Example questions, shown until something is asked. */
  suggestions?: string[];
  /** Sidebar variant: tighter, no example questions. */
  compact?: boolean;
}) {
  const [state, formAction] = useActionState<HelpAskState, FormData>(askHelp, { status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  const ask = (question: string) => {
    if (!inputRef.current) return;
    inputRef.current.value = question;
    inputRef.current.form?.requestSubmit();
  };

  return (
    <section
      aria-labelledby="help-assistant-heading"
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" aria-hidden="true" />
        <h2 id="help-assistant-heading" className={compact ? "text-sm font-semibold" : "text-base font-semibold"}>
          Ask about WonderArk
        </h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Answered from these user guides, with a link to the section it came from.
      </p>

      <form action={formAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          ref={inputRef}
          name="question"
          type="text"
          required
          maxLength={500}
          placeholder="How do I reconcile a bank statement?"
          aria-label="Your question"
          className="flex-1"
        />
        <SubmitButton pendingText="Looking…" className="sm:w-auto">
          Ask
        </SubmitButton>
      </form>

      {state.status === "idle" && suggestions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => ask(suggestion)}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      {state.status === "error" ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      {state.status === "answered" ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {state.question}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">{state.answer}</p>

          {state.sources.length > 0 ? (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {state.mode === "assistant" ? "Read more" : "Where to look"}
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {state.sources.map((source) => (
                  <li key={`${source.guideSlug}-${source.sectionId}`}>
                    <Link
                      href={source.href}
                      className="group flex items-start gap-1.5 text-sm text-primary hover:underline"
                    >
                      <ArrowRight
                        className="mt-0.5 size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                      <span>
                        {source.heading}
                        <span className="text-muted-foreground"> · {source.guideTitle}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
