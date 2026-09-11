"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@cofounderai/core/ui/badge";
import { Button } from "@cofounderai/core/ui/button";
import { formatDateTime } from "@cofounderai/core/lib/format";
import type { ConversationSummaryResult } from "@cofounderai/module-crm/lib/ai/conversation-summary";

const SENTIMENT_VARIANT: Record<ConversationSummaryResult["sentiment"], "default" | "secondary" | "destructive"> = {
  positive: "secondary",
  neutral: "default",
  negative: "destructive",
};

/**
 * CRM-12.2's own card in the Conversations right pane. Keyed by `conversationId` from
 * the parent so switching conversations resets the shown summary rather than carrying
 * over the previous one's stale state.
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
          <div>
            <p className="text-xs font-medium">Next action</p>
            <p className="text-xs text-muted-foreground">{result.nextAction}</p>
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
