"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { formatDateTime } from "@cofounderai/core/lib/format";
import { NEXT_BEST_ACTION_LABEL, type ConversationSummaryResult } from "@cofounderai/module-crm/lib/ai/conversation-summary-types";

const SENTIMENT_VARIANT: Record<ConversationSummaryResult["sentiment"], "default" | "secondary" | "destructive"> = {
  positive: "secondary",
  neutral: "default",
  negative: "destructive",
};

/**
 * CRM-12.2's own card in the Conversations right pane. Keyed by `conversationId` from
 * the parent so switching conversations resets the shown summary rather than carrying
 * over the previous one's stale state.
 *
 * CRM-12.4's "Next Best Action" is the highlighted badge+rationale block below --
 * advisory only ("the model may prioritize; it must not silently execute external
 * actions"): clicking nothing here sends a message, creates a task, or changes any
 * record: it is text a founder reads and decides on, same as the rest of this card.
 */
export function ConversationSummaryCard({
  initialSummary,
  generateAction,
}: {
  initialSummary: { data: ConversationSummaryResult; generatedAt: string } | null;
  generateAction: () => Promise<ConversationSummaryResult | { error: string }>;
}) {
  const [result, setResult] = useState(initialSummary?.data ?? null);
  const [generatedAt, setGeneratedAt] = useState(initialSummary?.generatedAt ?? null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setIsGenerating(true);
    setError(null);
    const response = await generateAction();
    setIsGenerating(false);
    if ("error" in response) {
      setError(response.error);
      return;
    }
    setResult(response);
    setGeneratedAt(new Date().toISOString());
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">AI summary</p>
        <Button type="button" size="sm" variant="outline" onClick={generate} disabled={isGenerating}>
          <Sparkles className="mr-1.5 size-3.5" />
          {isGenerating ? "Generating..." : result ? "Regenerate" : "Generate summary"}
        </Button>
      </div>
      {result ? (
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant={SENTIMENT_VARIANT[result.sentiment]} className="capitalize">
              {result.sentiment}
            </Badge>
            {generatedAt ? <span className="text-xs text-muted-foreground">Generated {formatDateTime(generatedAt)}</span> : null}
          </div>
          <p className="text-muted-foreground">{result.summary}</p>
          {result.unresolvedQuestions.length > 0 ? (
            <div>
              <p className="text-xs font-medium">Unresolved questions</p>
              <ul className="list-inside list-disc text-xs text-muted-foreground">
                {result.unresolvedQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.promisedActions.length > 0 ? (
            <div>
              <p className="text-xs font-medium">Promised actions</p>
              <ul className="list-inside list-disc text-xs text-muted-foreground">
                {result.promisedActions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium">Recommended next action</p>
              <Badge variant="outline">{NEXT_BEST_ACTION_LABEL[result.nextBestAction]}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{result.nextBestActionRationale}</p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No summary generated yet.</p>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
