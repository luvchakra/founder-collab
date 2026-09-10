import { cn } from "@cofounderai/core/lib/utils";

/**
 * Item #6 of a UX pass: a red/amber/green status derived from a prospect's `fit_score`
 * (0-100, lib/scoring/score-prospect.ts) so a founder scanning a list of prospects can
 * tell strong fits from weak ones at a glance, instead of reading a bare number on each
 * row. 70/40 is a reasonable strong/moderate/weak split for a 0-100 fit score and isn't
 * tied to any other threshold already in this codebase -- there wasn't one to match.
 */
export type ScoreRag = "green" | "amber" | "red" | "unscored";

export function scoreToRag(score: number | null | undefined): ScoreRag {
  if (score === null || score === undefined) return "unscored";
  if (score >= 70) return "green";
  if (score >= 40) return "amber";
  return "red";
}

const RAG_LABEL: Record<ScoreRag, string> = {
  green: "Strong fit",
  amber: "Moderate fit",
  red: "Weak fit",
  unscored: "Not scored",
};

const RAG_DOT_CLASS: Record<ScoreRag, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  unscored: "bg-muted-foreground/40",
};

const RAG_BADGE_CLASS: Record<ScoreRag, string> = {
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  red: "bg-red-500/10 text-red-700 dark:text-red-400",
  unscored: "bg-muted text-muted-foreground",
};

/** A small dot -- for tight spaces (a table cell, a chip) where a full badge doesn't fit. */
export function ScoreRagDot({ score, className }: { score: number | null | undefined; className?: string }) {
  const rag = scoreToRag(score);
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", RAG_DOT_CLASS[rag], className)}
      title={RAG_LABEL[rag]}
      aria-label={RAG_LABEL[rag]}
    />
  );
}

/** The dot plus the score/label -- for a card or a detail page where there's room to
 * spell out what the color means. */
export function ScoreRagBadge({ score, className }: { score: number | null | undefined; className?: string }) {
  const rag = scoreToRag(score);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        RAG_BADGE_CLASS[rag],
        className,
      )}
    >
      <ScoreRagDot score={score} />
      {score === null || score === undefined ? RAG_LABEL.unscored : `${score} · ${RAG_LABEL[rag]}`}
    </span>
  );
}
