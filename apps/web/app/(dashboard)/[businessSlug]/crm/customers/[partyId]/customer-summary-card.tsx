"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@cofounderai/core/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@cofounderai/core/ui/card";
import { EmptyState } from "@cofounderai/core/ui/empty-state";
import { formatDateTime } from "@cofounderai/core/lib/format";

/**
 * CRM-12.1's own card on the Customer 360 page -- "Generate summary" is an explicit
 * click (never triggered by opening the page, keeping the paid AI call opt-in), and
 * `generateAction`'s own cache means clicking again with nothing changed returns the
 * same summary without a second model call. Read-only output: unlike CRM-08.6's review
 * draft, there is nothing here for a human to edit/approve before it "sends" -- this is
 * informational, not an outbound action.
 */
export function CustomerSummaryCard({
  initialSummary,
  generateAction,
}: {
  initialSummary: { summary: string; generatedAt: string } | null;
  generateAction: () => Promise<{ summary: string } | { error: string }>;
}) {
  const [summary, setSummary] = useState(initialSummary?.summary ?? null);
  const [generatedAt, setGeneratedAt] = useState(initialSummary?.generatedAt ?? null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setIsGenerating(true);
    setError(null);
    const result = await generateAction();
    setIsGenerating(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSummary(result.summary);
    setGeneratedAt(new Date().toISOString());
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base">AI summary</CardTitle>
        <Button type="button" size="sm" variant="outline" onClick={generate} disabled={isGenerating}>
          <Sparkles className="mr-1.5 size-3.5" />
          {isGenerating ? "Generating..." : summary ? "Regenerate" : "Generate summary"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {summary ? (
          <>
            <p className="text-sm text-muted-foreground">{summary}</p>
            {generatedAt ? <p className="text-xs text-muted-foreground">Generated {formatDateTime(generatedAt)}</p> : null}
          </>
        ) : (
          <EmptyState icon={Sparkles} message="No summary generated yet." />
        )}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
